import { io } from 'socket.io-client';
const socket = io('chasing-production.up.railway.app');
export default socket;