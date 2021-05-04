
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

export type MainOptions = Partial<Options> & BindOptions;

export interface RArg {
  stat: fs.Stats|null;
  filename: string;
  pathname: string;
}

export interface RResult {
  buffer: Buffer;
  contentType?: string;
}

export type Rewriter = (arg: RArg) => Promise<RResult|undefined>;

/**
 * Builds middleware that serves static files from the specified path, or the current directory by
 * default. These files will always be served with zero caching headers.
 */
export default function buildHandler(o: Options|string = '.'): Handler;

/**
 * Creates a new dhost instance, including logging its friendly output. Used if you are building
 * a dev server for yourself. This method never returns successfully and will always crash.
 */
export function main(o: MainOptions): Promise<void>;

/**
 * Standard rewriters that can be used by clients.
 */
export const rewriters = {

  /**
   * Creates directory listings if a directory is requested.
   */
  directoryListing: Rewriter,

  /**
   * Rewrites JS files for static ESM imports.
   */
  moduleRewriter: Rewriter,

};
