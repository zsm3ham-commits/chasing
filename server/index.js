const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "http://localhost:5173" }
});

// ─── Game Logic ───────────────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const VALID_COUNTS = [1, 2, 3, 5];
const RANK_ORDER = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
const SUIT_ORDER = ['♦','♣','♥','♠'];

function buildDeck() {
    const cards = [];
    for (const suit of SUITS)
        for (const rank of RANKS)
            cards.push({ suit, rank, id: `${rank}${suit}` });
    return cards;
}

function shuffle(deck) {
    const d = [...deck];
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
}

function getHandValue(selectedCards) {
    let highestCard = selectedCards[0];
    for (const card of selectedCards) {
        const cardRank = RANK_ORDER.indexOf(card.rank);
        const highestRank = RANK_ORDER.indexOf(highestCard.rank);
        if (cardRank > highestRank) {
            highestCard = card;
        } else if (cardRank === highestRank) {
            if (SUIT_ORDER.indexOf(card.suit) > SUIT_ORDER.indexOf(highestCard.suit)) {
                highestCard = card;
            }
        }
    }
    return RANK_ORDER.indexOf(highestCard.rank) * 4 + SUIT_ORDER.indexOf(highestCard.suit);
}

function getPokerHandType(selectedCards) {
    const ranks = selectedCards.map(c => RANK_ORDER.indexOf(c.rank)).sort((a, b) => a - b);
    const suits = selectedCards.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    if (isFlush && isStraight)              return { type: "Straight Flush", score: 8 };
    if (counts[0] === 4)                    return { type: "Four of a Kind", score: 7 };
    if (counts[0] === 3 && counts[1] === 2) return { type: "Full House",     score: 6 };
    if (isFlush)                            return { type: "Flush",           score: 5 };
    if (isStraight)                         return { type: "Straight",        score: 4 };
    return null;
}

function getFullHouseValue(selectedCards) {
    const ranks = selectedCards.map(c => RANK_ORDER.indexOf(c.rank));
    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    for (const [rank, count] of Object.entries(rankCounts)) {
        if (count === 3) return Number(rank);
    }
}

function getFourValue(selectedCards) {
    const ranks = selectedCards.map(c => RANK_ORDER.indexOf(c.rank));
    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    for (const [rank, count] of Object.entries(rankCounts)) {
        if (count === 4) return Number(rank);
    }
}

function isFirstTurnValid(selectedCards) {
    if (!VALID_COUNTS.includes(selectedCards.length)) return false;
    const has3Diamond = selectedCards.some(c => c.rank === '3' && c.suit === '♦');
    if (!has3Diamond) return false;
    if (selectedCards.length === 2) {
        if (selectedCards[0].rank !== selectedCards[1].rank) return false;
    } else if (selectedCards.length === 3) {
        if (!(selectedCards[0].rank === selectedCards[1].rank && selectedCards[1].rank === selectedCards[2].rank)) return false;
    } else if (selectedCards.length === 5) {
        if (getPokerHandType(selectedCards) === null) return false;
    }
    return true;
}

function isMoveValid(selectedCards, currentHandValue, currentCardCount) {
    const handValue = getHandValue(selectedCards);
    if (currentCardCount !== 0 && currentCardCount !== selectedCards.length) return false;
    if (selectedCards.length === 1) {
        return handValue > currentHandValue;
    } else if (selectedCards.length === 2) {
        return selectedCards[0].rank === selectedCards[1].rank && handValue > currentHandValue;
    } else if (selectedCards.length === 3) {
        return selectedCards[0].rank === selectedCards[1].rank &&
               selectedCards[1].rank === selectedCards[2].rank &&
               handValue > currentHandValue;
    } else if (selectedCards.length === 5) {
        const pokerHand = getPokerHandType(selectedCards);
        if (pokerHand === null) return false;
        if (typeof currentHandValue === 'number') return true;
        if (pokerHand.score > currentHandValue.score) return true;
        if (pokerHand.score === currentHandValue.score) {
            if (pokerHand.type === 'Full House') {
                return getFullHouseValue(selectedCards) > currentHandValue.tripleRank;
            } else if (pokerHand.type === 'Four of a Kind') {
                return getFourValue(selectedCards) > currentHandValue.quadRank;
            }
            return handValue > currentHandValue.highCard;
        }
        return false;
    }
    return false;
}

function createInitialState(playerNames) {
    const shuffled = shuffle(buildDeck());
    const numPlayers = playerNames.length;
    const hands = playerNames.map(() => []);
    let deckCopy = [...shuffled];
    while (deckCopy.length > 0) {
        for (let i = 0; i < numPlayers; i++) {
            if (deckCopy.length === 0) break;
            hands[i].push(deckCopy.shift());
        }
    }
    const players = playerNames.map((name, i) => ({ name, hand: hands[i] }));
    let startingPlayer = 0;
    for (const [i, player] of players.entries()) {
        for (const card of player.hand) {
            if (`${card.rank}${card.suit}` === "3♦") startingPlayer = i;
        }
    }
    return {
        players,
        currentTurn: startingPlayer,
        currentHandValue: 0,
        currentCardCount: 0,
        passes: 0,
        isFirstTurn: true,
        lastPlayedCards: [],
        log: [`Game started! ${players[startingPlayer].name} goes first (has 3♦).`],
        gameOver: false,
        winner: null,
    };
}

// ─── Room Management ──────────────────────────────────────────────────────────

const rooms = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create room — just reserves a code, no names yet
    socket.on('create-room', ({ numPlayers }) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomCode] = {
            numPlayers,
            playerNames: [],
            socketIds: [],
            state: null,
        };
        socket.emit('room-created', { roomCode });
        console.log(`Room ${roomCode} created, waiting for ${numPlayers} players`);
    });

    // Join room — each player provides their name
    socket.on('join-room', ({ roomCode, playerName }) => {
        const room = rooms[roomCode];
        if (!room) { socket.emit('error', 'Room not found'); return; }
        if (room.playerNames.length >= room.numPlayers) { socket.emit('error', 'Room is full'); return; }

        const playerIndex = room.playerNames.length;
        room.playerNames.push(playerName);
        room.socketIds.push(socket.id);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerIndex = playerIndex;

        // tell this player their index
        socket.emit('player-assigned', { playerIndex, roomCode });

        // tell everyone the current waiting status
        io.to(roomCode).emit('waiting', {
            joined: room.playerNames.length,
            total: room.numPlayers,
            players: room.playerNames,
        });

        // start game once everyone has joined
        if (room.playerNames.length === room.numPlayers) {
            room.state = createInitialState(room.playerNames);
            io.to(roomCode).emit('game-state', room.state);
            console.log(`Room ${roomCode} game started`);
        }
    });

    // Play cards
    socket.on('play-card', ({ selectedCards }) => {
        const roomCode = socket.roomCode;
        const room = rooms[roomCode];
        if (!room || !room.state) return;
        const state = room.state;

        // make sure it's this player's turn
        if (socket.playerIndex !== state.currentTurn) {
            socket.emit('error', 'Not your turn!');
            return;
        }

        if (state.isFirstTurn) {
            if (!isFirstTurnValid(selectedCards)) {
                socket.emit('error', 'First play must include the 3♦!');
                return;
            }
        } else {
            if (!VALID_COUNTS.includes(selectedCards.length)) {
                socket.emit('error', 'You must select 1, 2, 3 or 5 cards!');
                return;
            }
            if (!isMoveValid(selectedCards, state.currentHandValue, state.currentCardCount)) {
                socket.emit('error', 'Invalid move! Your hand must beat the current hand.');
                return;
            }
        }

        let newHandValue;
        if (selectedCards.length === 5) {
            const pokerHand = getPokerHandType(selectedCards);
            newHandValue = {
                score: pokerHand.score,
                highCard: getHandValue(selectedCards),
                tripleRank: pokerHand.type === 'Full House' ? getFullHouseValue(selectedCards) : null,
                quadRank: pokerHand.type === 'Four of a Kind' ? getFourValue(selectedCards) : null,
            };
        } else {
            newHandValue = getHandValue(selectedCards);
        }

        const selectedIds = selectedCards.map(c => c.id);
        state.players = state.players.map((p, i) => {
            if (i === state.currentTurn)
                return { ...p, hand: p.hand.filter(c => !selectedIds.includes(c.id)) };
            return p;
        });

        const cardNames = selectedCards.map(c => `${c.rank}${c.suit}`).join(', ');
        const handLabel = selectedCards.length === 5 ? ` (${getPokerHandType(selectedCards).type})` : '';
        state.log = [`${state.players[state.currentTurn].name} played ${cardNames}${handLabel}`, ...state.log].slice(0, 6);

        if (state.players[state.currentTurn].hand.length === 0) {
            state.gameOver = true;
            state.winner = state.players[state.currentTurn].name;
            io.to(roomCode).emit('game-state', state);
            return;
        }

        state.currentHandValue = newHandValue;
        state.lastPlayedCards = selectedCards;
        state.isFirstTurn = false;
        state.currentCardCount = selectedCards.length;
        state.passes = 0;
        state.currentTurn = (state.currentTurn + 1) % state.players.length;

        io.to(roomCode).emit('game-state', state);
    });

    // Pass turn
    socket.on('pass-turn', () => {
        const roomCode = socket.roomCode;
        const room = rooms[roomCode];
        if (!room || !room.state) return;
        const state = room.state;

        if (socket.playerIndex !== state.currentTurn) {
            socket.emit('error', 'Not your turn!');
            return;
        }

        if (state.isFirstTurn) {
            socket.emit('error', 'Cannot skip first turn');
            return;
        }

        const newTurn = (state.currentTurn + 1) % state.players.length;
        const newPasses = state.passes + 1;

        if (newPasses === state.players.length - 1) {
            state.log = [`Everyone passed — ${state.players[newTurn].name}'s turn`, ...state.log].slice(0, 6);
            state.passes = 0;
            state.currentHandValue = 0;
            state.currentCardCount = 0;
            state.lastPlayedCards = [];
        } else {
            state.log = [`${state.players[state.currentTurn].name} passed. ${state.players[newTurn].name}'s turn`, ...state.log].slice(0, 6);
            state.passes = newPasses;
        }

        state.currentTurn = newTurn;
        io.to(roomCode).emit('game-state', state);
    });

    // Reorder hand — only send update to the player who reordered
    socket.on('reorder-hand', ({ playerIndex, fromIndex, toIndex }) => {
        const roomCode = socket.roomCode;
        const room = rooms[roomCode];
        if (!room || !room.state) return;
        const state = room.state;
        const hand = [...state.players[playerIndex].hand];
        const [moved] = hand.splice(fromIndex, 1);
        hand.splice(toIndex, 0, moved);
        state.players[playerIndex].hand = hand;
        socket.emit('game-state', state);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
    });
});

server.listen(3001, () => {
    console.log('Server running on port 3001');
});
