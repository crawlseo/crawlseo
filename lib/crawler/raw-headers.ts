import type { Dispatcher } from "undici";

/*
 * fetch() joins repeated response headers into one value, which loses where
 * one header line ended. For X-Robots-Tag that changes the meaning:
 * `bingbot: noindex` and a second `noindex` header arrive as
 * "bingbot: noindex, noindex", which reads as two directives for bingbot.
 * This interceptor sees the headers below fetch(), where repeated headers are
 * still separate values, and records the lines of one header (#105).
 */

type Headers = Record<string, string | string[] | undefined>;

/**
 * A dispatcher that behaves like `base` and records every line of the
 * `name` response header, plus the function that returns the lines of the
 * last response. Use one per request.
 */
export function captureHeaderLines(
  base: Dispatcher,
  name: string
): { dispatcher: Dispatcher; lines: () => string[] | null } {
  const wanted = name.toLowerCase();
  let lines: string[] | null = null;

  const fromObject = (headers: Headers) => {
    const found: string[] = [];
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== wanted || value === undefined) continue;
      found.push(...(Array.isArray(value) ? value : [value]));
    }
    lines = found;
  };
  const fromRaw = (raw: (Buffer | string)[]) => {
    const found: string[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      if (String(raw[i]).toLowerCase() === wanted) found.push(String(raw[i + 1]));
    }
    lines = found;
  };

  const dispatcher = base.compose((dispatch) => (opts, handler) =>
    dispatch(
      opts,
      new Proxy(handler, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target);
          if (typeof value !== "function") return value;
          if (prop === "onResponseStart") {
            return (controller: unknown, status: number, headers: Headers, ...rest: unknown[]) => {
              fromObject(headers ?? {});
              return value.call(target, controller, status, headers, ...rest);
            };
          }
          if (prop === "onHeaders") {
            return (status: number, raw: (Buffer | string)[], ...rest: unknown[]) => {
              fromRaw(raw ?? []);
              return value.call(target, status, raw, ...rest);
            };
          }
          return value.bind(target);
        },
      })
    )
  );

  return { dispatcher, lines: () => lines };
}
