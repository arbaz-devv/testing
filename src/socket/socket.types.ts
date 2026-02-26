import type { Server } from 'socket.io';

declare global {
  // eslint-disable-next-line no-var
  var __socketIO: Server | undefined;
}

export {};
