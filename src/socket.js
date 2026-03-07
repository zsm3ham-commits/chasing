import { io } from 'socket.io-client';
const socket = io('https://chasing-production.up.railway.app/');
export default socket;