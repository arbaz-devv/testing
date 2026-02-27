import type { Server } from 'socket.io';

declare global {
  var __socketIO: Server | undefined;
}

export {};
