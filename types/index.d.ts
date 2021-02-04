
import * as http from 'http';

export type IncomingMessage = http.IncomingMessage & {originalUrl?: string};

export interface Options {
  path: string;
  cors?: boolean;
  serveLink?: boolean;
  serveHidden?: boolean;
  listing?: boolean;
  module?: boolean;
};
