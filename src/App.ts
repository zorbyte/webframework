import { Server, IncomingMessage, ServerResponse } from "http";
import { format } from "util";

import Trouter = require("trouter");

type Middleware = (req: IncomingMessage, res: ServerResponse, err?: any) => Promise<any> | any;

interface App {
  all(route: string | RegExp, ...fns: Middleware[]): App;
  get(route: string | RegExp, ...fns: Middleware[]): App;
  head(route: string | RegExp, ...fns: Middleware[]): App;
  patch(route: string | RegExp, ...fns: Middleware[]): App;
  options(route: string | RegExp, ...fns: Middleware[]): App;
  connect(route: string | RegExp, ...fns: Middleware[]): App;
  delete(route: string | RegExp, ...fns: Middleware[]): App;
  trace(route: string | RegExp, ...fns: Middleware[]): App;
  post(route: string | RegExp, ...fns: Middleware[]): App;
  put(route: string | RegExp, ...fns: Middleware[]): App;
}

class App {
  public server = new Server();
  
  private router = new Trouter();
  private stack: (Middleware | number)[] = [];

  public constructor() {
    this.addRouteMethod("all");
    this.addRouteMethod("get");
    this.addRouteMethod("head");
    this.addRouteMethod("patch");
    this.addRouteMethod("options");
    this.addRouteMethod("connect");
    this.addRouteMethod("delete");
    this.addRouteMethod("trace");
    this.addRouteMethod("post");
    this.addRouteMethod("put");

    this.server.on("request", (req, res) => {
      setImmediate(() => this.requestListener(req, res)
        .catch(err => this.server.emit("error", err))
      );
    });
  }

  private addRouteMethod(method: string): void {
    // This is a very nasty looking function, but it does the job.

    // @ts-ignore
    this[method] = (route: string | RegExp, ...fns: Middleware[]) => {
      for (const fn of fns) {
        // @ts-ignore
        const trouterId = this.router.routes.length;
        this.stack.push(trouterId);

        // @ts-ignore
        this.router[method](route, { trouterId, fn });
      }
      return this;
    }
  }

  private async requestListener(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const foundRoutes = this.router.find(req.method as Trouter.HTTPMethod, req.url);
    let trouterIterPos = 0;
    for (const fnIdx in this.stack) {
      const _fn = this.stack[fnIdx];
      let isRouted = false;
      let fn: Middleware;
      if (typeof _fn === "number") {
        let potentialRoutedFn = foundRoutes.handlers
          .find(({ trouterId }) => _fn === trouterId);
        if (!potentialRoutedFn) continue;
        trouterIterPos++;
        if (potentialRoutedFn.fn.length > 2) continue;
        isRouted = true;
        fn = potentialRoutedFn.fn;
      } else {
        fn = _fn;
      }
      let result: any;
      try {
        result = await fn(req, res);
      } catch (err) {
        const lastStackItem = this.stack[this.stack.length - 1];
        let errFn = this.fallBackError;
        if (isRouted) {
          let errFnRouted = foundRoutes.handlers.slice(trouterIterPos).find(({ fn }) => fn.length > 2);
          if (errFnRouted && errFnRouted.fn) errFn = errFnRouted.fn;
        } else if (typeof lastStackItem !== "number" && lastStackItem.length > 2) {
          // Fallback to the global custom error func if available.
          errFn = lastStackItem;
        }

        try {
          // This try catch is kind of messy, but it's better than nothing.
          result = await errFn(req, res, err)
        } catch (err) {
          // Prevent double execution. Create unhandled promise rejection error.
          if (errFn === this.fallBackError) throw err;
          result = await this.fallBackError(req, res, err);
        }
      } finally {
        // If none of these are true, we can assume that loop is still running.
        if (res.headersSent || res.finished) return;
        if (result !== void 0 && result !== null) {
          res.end(result);
          return;
        }
      }
    }

    // This code should be unreachable!
    console.warn("The framework has just reached \"unreachable\" code. You should make a bug report about this!");
    await this.notFound(req, res);
  }

  private async notFound(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.statusCode = 404;
    res.setHeader("Content-type", "application/json; charset=utf-8");
    res.end("{ \"status\": 404, \"message\": \"The requested resource could not be found!\" }");
  }

  private async fallBackError(_req: IncomingMessage, res: ServerResponse, err: any): Promise<string> {
    console.error(err);
    res.statusCode = 500;
    return format(err);
  }

  public use(...fns: Middleware[]): App;
  public use(route: string | RegExp, ...fns: Middleware[]): App;
  public use(route: string | RegExp | Middleware, ...fns: Middleware[]): App {
    const notRouted = typeof route !== "string" && !(route instanceof RegExp);
    if (notRouted) fns.unshift(route as Middleware);
    for (const fn of fns) {
      if (!notRouted) {
        // @ts-ignore
        const trouterId = this.router.routes.length;
        this.router.use(route as string | RegExp, { trouterId, fn });
        this.stack.push(trouterId);
      } else {
        this.stack.push(fn);
      }
    }

    return this;
  }

  public start(port?: number, hostname?: string, backlog?: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Insert the default 404 just before the error handler.
      this.stack.splice(this.stack.length, 0, this.notFound);
      this.server.once("error", reject);
      this.server.once("listening", () => {
        this.server.off("error", reject);
        resolve();
      });
      this.server.listen(port, hostname, backlog);
    });
  }
}

export default App;
