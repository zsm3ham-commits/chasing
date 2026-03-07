import { useState, useEffect, useRef } from "react";
import socket from './socket';

const RED_SUITS = ['♥', '♦'];
const VALID_COUNTS = [1, 2, 3, 5];

function Card({ card, selected, onClick, faceDown, draggable, onDragStart, onDragOver, onDrop }) {
  const red = RED_SUITS.includes(card?.suit);
  return (
    <div onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver?.(); }}
      onDrop={onDrop}
      style={{
      width: 60, height: 90, borderRadius: 8,
      border: selected ? '2px solid #4f8ef7' : '2px solid #ccc',
      background: faceDown ? '#2c5f8a' : 'white',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      cursor: draggable ? 'grab' : onClick ? 'pointer' : 'default',
      transform: selected ? 'translateY(-12px)' : 'none',
      transition: 'transform 0.15s, border 0.15s',
      boxShadow: selected ? '0 4px 12px rgba(79,142,247,0.4)' : '0 2px 4px rgba(0,0,0,0.2)',
      userSelect: 'none', flexShrink: 0,
      backgroundImage: faceDown ? 'repeating-linear-gradient(45deg, #1a4a6e, #1a4a6e 5px, #2c5f8a 5px, #2c5f8a 10px)' : 'none'
    }}>
      {!faceDown && <>
        <div style={{ fontSize: 13, fontWeight: 'bold', color: red ? '#e53935' : '#222' }}>{card.rank}</div>
        <div style={{ fontSize: 18, color: red ? '#e53935' : '#222' }}>{card.suit}</div>
      </>}
    </div>
  );
}

function Hand({ player, playerIndex, selectedCards, onSelectCard, isActive, faceDown, onReorder }) {
  const [dragIndex, setDragIndex] = useState(null);
  return (
    <div style={{
      background: isActive ? 'rgba(79,142,247,0.1)' : 'rgba(255,255,255,0.05)',
      border: isActive ? '2px solid #4f8ef7' : '2px solid transparent',
      borderRadius: 12, padding: '12px 16px', marginBottom: 16
    }}>
      <div style={{ color: '#fff', marginBottom: 8, fontWeight: 'bold', fontSize: 14 }}>
        {player.name} {isActive && '← current turn'}
        <span style={{ fontWeight: 'normal', marginLeft: 8, opacity: 0.6 }}>
          ({player.hand.length} cards)
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {player.hand.map((card, i) => (
          <Card
            key={card.id}
            card={card}
            faceDown={faceDown}
            selected={selectedCards.some(c => c.id === card.id)}
            onClick={isActive && !faceDown ? () => onSelectCard(card) : undefined}
            draggable={isActive && !faceDown}
            onDragStart={() => setDragIndex(i)}
            onDragOver={() => {
              if (dragIndex !== null && dragIndex !== i) {
                onReorder(playerIndex, dragIndex, i);
                setDragIndex(i);
              }
            }}
            onDrop={() => setDragIndex(null)}
          />
        ))}
        {player.hand.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>No cards</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  // local UI state
  const [selectedCards, setSelectedCards] = useState([]);
  const [error, setError] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [numPlayers, setNumPlayers] = useState(2);
  const [myName, setMyName] = useState('');
  const [screen, setScreen] = useState('lobby'); // 'lobby' | 'waiting' | 'game'
  const [waiting, setWaiting] = useState(null);
  const [myPlayerIndex, setMyPlayerIndex] = useState(null);
  const myNameRef = useRef(''); // ref so socket listeners can access latest value

  // game state — received from server
  const [players, setPlayers] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [lastPlayedCards, setLastPlayedCards] = useState([]);
  const [log, setLog] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);

  // keep ref in sync with state
  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);

  // listen for server events
  useEffect(() => {
    socket.on('game-state', (state) => {
      setPlayers(state.players);
      setCurrentTurn(state.currentTurn);
      setLastPlayedCards(state.lastPlayedCards);
      setLog(state.log);
      setGameOver(state.gameOver);
      setWinner(state.winner);
      setScreen('game');
    });

    socket.on('room-created', ({ roomCode }) => {
      setRoomCode(roomCode);
      // creator joins immediately with their name
      socket.emit('join-room', { roomCode, playerName: myNameRef.current });
    });

    socket.on('player-assigned', ({ playerIndex }) => {
      setMyPlayerIndex(playerIndex);
      setScreen('waiting');
    });

    socket.on('waiting', ({ joined, total, players }) => {
      setWaiting({ joined, total, players });
    });

    socket.on('error', (msg) => {
      setError(msg);
    });

    return () => {
      socket.off('game-state');
      socket.off('room-created');
      socket.off('player-assigned');
      socket.off('waiting');
      socket.off('error');
    };
  }, []);

  function createRoom() {
    if (!myName.trim()) { setError('Enter your name first'); return; }
    setError('');
    socket.emit('create-room', { numPlayers });
  }

  function joinRoom() {
    if (!myName.trim()) { setError('Enter your name first'); return; }
    if (!roomInput.trim()) { setError('Enter a room code'); return; }
    setError('');
    socket.emit('join-room', { roomCode: roomInput.toUpperCase(), playerName: myName });
  }

  function selectCard(card) {
    const alreadySelected = selectedCards.some(c => c.id === card.id);
    setError('');
    if (alreadySelected) {
      setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    } else {
      if (selectedCards.length < 5) {
        setSelectedCards([...selectedCards, card]);
      }
    }
  }

  function playCard() {
    if (selectedCards.length === 0) return;
    socket.emit('play-card', { selectedCards });
    setSelectedCards([]);
  }

  function endTurn() {
    socket.emit('pass-turn');
    setSelectedCards([]);
  }

  function reorderHand(playerIndex, fromIndex, toIndex) {
    socket.emit('reorder-hand', { playerIndex, fromIndex, toIndex });
  }

  const isMyTurn = myPlayerIndex === currentTurn;

  // ── Lobby ──────────────────────────────────────────────────────────────────
  if (screen === 'lobby') return (
    <div style={{ minHeight: '100vh', background: '#1a472a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, width: 340 }}>
        <h2 style={{ color: '#fff', marginBottom: 24, textAlign: 'center' }}>🃏 Card Table</h2>

        <label style={{ color: '#fff', fontSize: 14 }}>Your name</label>
        <input value={myName} placeholder="Enter your name"
          onChange={e => setMyName(e.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 6, marginBottom: 20, padding: '8px 10px', borderRadius: 8, border: 'none', fontSize: 15, boxSizing: 'border-box' }}
        />

        {/* Create room */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ color: '#fff', fontSize: 14 }}>Number of players</label>
          <input type="number" min={2} max={4} value={numPlayers}
            onChange={e => setNumPlayers(Number(e.target.value))}
            style={{ display: 'block', width: '100%', marginTop: 6, marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: 'none', fontSize: 16, boxSizing: 'border-box' }}
          />
          <button onClick={createRoom} style={{
            width: '100%', padding: '12px 0', borderRadius: 10,
            background: '#4f8ef7', color: '#fff', border: 'none', fontSize: 16,
            fontWeight: 'bold', cursor: 'pointer'
          }}>Create Game</button>
        </div>

        {/* Join room */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 20 }}>
          <label style={{ color: '#fff', fontSize: 14 }}>Join existing game</label>
          <input value={roomInput} placeholder="Enter room code"
            onChange={e => setRoomInput(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 6, marginBottom: 8, padding: '8px 10px', borderRadius: 8, border: 'none', fontSize: 15, boxSizing: 'border-box' }}
          />
          <button onClick={joinRoom} style={{
            width: '100%', padding: '12px 0', borderRadius: 10,
            background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', fontSize: 16,
            fontWeight: 'bold', cursor: 'pointer'
          }}>Join Game</button>
        </div>

        {error && <div style={{ color: '#ff6b6b', marginTop: 12, fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );

  // ── Waiting room ───────────────────────────────────────────────────────────
  if (screen === 'waiting') return (
    <div style={{ minHeight: '100vh', background: '#1a472a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, width: 340, textAlign: 'center' }}>
        <h2 style={{ color: '#fff', marginBottom: 8 }}>🃏 Waiting for players</h2>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 20 }}>
          Room code: <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 20 }}>{roomCode}</span>
        </div>
        {waiting && (
          <>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 12 }}>
              {waiting.joined} / {waiting.total} players joined
            </div>
            {waiting.players.map((name, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.1)', borderRadius: 8,
                padding: '8px 12px', marginBottom: 6, color: '#fff', textAlign: 'left'
              }}>
                {i + 1}. {name} {i === myPlayerIndex && '(you)'}
              </div>
            ))}
          </>
        )}
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 16 }}>
          Share the room code with other players...
        </div>
      </div>
    </div>
  );

  // ── Game over ──────────────────────────────────────────────────────────────
  if (gameOver) return (
    <div style={{ minHeight: '100vh', background: '#1a472a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <h2 style={{ color: '#fff', marginBottom: 12 }}>🎉 Game Over!</h2>
        <p style={{ color: '#fff', fontSize: 20 }}>{winner} wins!</p>
        <button onClick={() => { setScreen('lobby'); setGameOver(false); }} style={{
          marginTop: 20, padding: '12px 24px', borderRadius: 10,
          background: '#4f8ef7', color: '#fff', border: 'none', fontSize: 16,
          fontWeight: 'bold', cursor: 'pointer'
        }}>New Game</button>
      </div>
    </div>
  );

  // ── Game ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#1a472a', fontFamily: 'sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto'}}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ color: '#fff', margin: 0 }}>🃏 Card Table</h2>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Room: {roomCode}</span>
          <button onClick={() => setScreen('lobby')} style={{
            padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.15)',
            color: '#fff', border: 'none', cursor: 'pointer'
          }}>Leave</button>
        </div>

        {/* Last played */}
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6 }}>LAST PLAYED</div>
          {lastPlayedCards.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', fontSize: 13 }}>None yet</div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {lastPlayedCards.map(card => (
                <Card key={card.id} card={card} faceDown={false} />
              ))}
            </div>
          )}
        </div>

        {/* Log */}
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, minHeight: 40 }}>
          {log.map((l, i) => (
            <div key={i} style={{ color: i === 0 ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 13 }}>{l}</div>
          ))}
        </div>

        {/* Hands — only show your own cards face up */}
        {players.map((player, i) => (
          <Hand
            key={i}
            player={player}
            playerIndex={i}
            isActive={i === currentTurn}
            faceDown={i !== myPlayerIndex}
            selectedCards={i === myPlayerIndex && isMyTurn ? selectedCards : []}
            onSelectCard={isMyTurn ? selectCard : () => {}}
            onReorder={reorderHand}
          />
        ))}

        {error && <div style={{ color: '#ff6b6b', marginBottom: 10, fontSize: 14 }}>{error}</div>}

        {/* Only show buttons on your turn */}
        {isMyTurn ? (
          <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
            <button onClick={playCard} style={{
              padding: '12px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: VALID_COUNTS.includes(selectedCards.length) ? '#4f8ef7' : 'rgba(255,255,255,0.1)',
              color: '#fff', fontWeight: 'bold', fontSize: 15
            }}>
              Play {selectedCards.length > 0 ? `${selectedCards.length} card${selectedCards.length > 1 ? 's' : ''}` : 'Card'}
            </button>
            <button onClick={endTurn} style={{
              padding: '12px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15
            }}>
              Pass
            </button>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              Select 1, 2, 3 or 5 cards
            </span>
          </div>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: 16, fontSize: 14 }}>
            Waiting for {players[currentTurn]?.name}'s turn...
          </div>
        )}
      </div>
    </div>
  );
}
