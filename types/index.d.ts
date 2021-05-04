
import * as fs from 'fs';
import * as http from 'http';

export type IncomingMessage = http.IncomingMessage & {originalUrl?: string};

export type InternalHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => Promise<void>;


export interface Options {
  path: string;
  cors: boolean;
  serveLink: boolean;
  serveHidden: boolean;
  rewriters: ((arg: RArg) => Promise<RResult|undefined>)[];
}

export interface BindOptions {
  port: number;
  portRange: boolean;
  bindAll: boolean;
}

export type MainOptions = Options & BindOptions;

export interface RArg {
  stat: fs.Stats|null;
  filename: string;
  pathname: string;
}

export interface RResult {
  buffer: Buffer;
  contentType?: string;
}

export * from '../index.js';
