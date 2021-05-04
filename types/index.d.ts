
import * as fs from 'fs';
import * as http from 'http';

export type IncomingMessage = http.IncomingMessage & {originalUrl?: string};

export interface Options {
  path: string;
  cors: boolean;
  serveLink: boolean;
  serveHidden: boolean;
  rewriters: ((arg: RArg) => Promise<RResult|undefined>)[];
}

export interface RArg {
  stat: fs.Stats?;
  filename: string;
  pathname: string;
}

export interface RResult {
  buffer: Buffer;
  contentType?: string;
}
