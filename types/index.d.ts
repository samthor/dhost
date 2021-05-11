
import * as fs from 'fs';
import * as http from 'http';

export type InternalHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => Promise<void>;


export interface ServeOptions {

  /**
   * The directory to serve contents from.
   *
   * @default '.'
   */
  path: string;

  /**
   * Whether to serve CORS requests.
   *
   * @default false
   */
  cors: boolean;

  /**
   * Whether to serve the contents of symlinks, not just valid 302's.
   *
   * @default false
   */
  serveLink: boolean;

  /**
   * Whether to serve hidden files.
   *
   * @default false
   */
  serveHidden: boolean;

  /**
   * Rewriters used to rewrite files, either missing or real. This is used by default to generate
   * directory listings and rewrite ESM imports.
   */
  rewriters: Rewriter[];

}

export interface BindOptions {

  /**
   * The port to bind to.
   *
   * @default 9000
   */
  port: number;

  /**
   * Whether we must bind only to the target port (`true`) or allow any nearby port.
   *
   * @default false
   */
  targetPort: boolean;

  /**
   * Whether to bind to all interfaces, not just localhost.
   *
   * @default false
   */
  bindAll: boolean;

}

export type MainOptions = Partial<ServeOptions & BindOptions>;

/**
 * The argument to {@link Rewriter}. This file may not exist, in which case the `stat` property
 * will be null.
 */
export interface RArg {
  stat: fs.Stats|null;

  /**
   * The actual filename on disk that would be served.
   */
  filename: string;

  /**
   * The requested pathname (from the server).
   */
  pathname: string;

  /**
   * Any search component, including the leading "?" if provided.
   */
  search: string;
}

/**
 * The optional result type. This will return a buffer to render, and an optional "Content-Type"
 * header (otherwise it will be inferred from the requested filename).
 */
export interface RResult {
  buffer: Buffer;
  contentType?: string;
}

/**
 * The type of a default 'rewriter' export, which will be run to determine whether a specific URL
 * should be rewritten to another result.
 */
export type Rewriter = (arg: RArg) => Promise<RResult|undefined>;

/**
 * Builds middleware that serves static files from the specified path, or the current directory by
 * default. These files will always be served with zero caching headers.
 */
export default function buildHandler(o: ServeOptions|string = '.'): Handler;

/**
 * Creates a new dhost instance, including logging its friendly output. Used if you are building
 * a dev server for yourself. This method never returns successfully and will always crash.
 */
export function main(o: MainOptions): Promise<never>;

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
