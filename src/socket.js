import { io } from 'socket.io-client';
const socket = io('https://your-railway-url.up.railway.app', {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
});
export default socket;