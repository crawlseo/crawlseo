import { createServer, type Server, type Socket } from "net";
import type { AddressInfo } from "net";

/*
 * A minimal SMTP server on loopback for tests: EHLO, AUTH PLAIN and LOGIN,
 * MAIL, RCPT, DATA, QUIT, no TLS. `mode` makes it refuse the login, answer a
 * temporary 451 to the message, or never greet (for timeouts).
 */

export type ReceivedMail = { from: string; to: string[]; data: string; auth: { user: string; pass: string } | null };
export type SmtpMode = "ok" | "auth-fail" | "temp-fail" | "silent";

export type TestSmtp = {
  port: number;
  mails: ReceivedMail[];
  /** Every line a client sent, for checks that a login never shows up elsewhere. */
  transcript: string[];
  mode: SmtpMode;
  close: () => Promise<void>;
};

export async function startTestSmtp(): Promise<TestSmtp> {
  const state: TestSmtp = { port: 0, mails: [], transcript: [], mode: "ok", close: async () => {} };
  const sockets = new Set<Socket>();

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    if (state.mode === "silent") return;
    const reply = (line: string) => socket.write(`${line}\r\n`);
    let buffer = "";
    let inData = false;
    let pendingLogin: "user" | "pass" | null = null;
    let login: { user: string; pass: string } | null = null;
    let mail: ReceivedMail = { from: "", to: [], data: "", auth: null };
    reply("220 test.local ESMTP");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let i: number;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        state.transcript.push(line);
        if (inData) {
          if (line === ".") {
            inData = false;
            if (state.mode === "temp-fail") {
              reply("451 4.3.0 Try again later");
            } else {
              state.mails.push({ ...mail, auth: login });
              reply("250 2.0.0 Queued");
            }
            mail = { from: "", to: [], data: "", auth: null };
          } else {
            mail.data += (line.startsWith("..") ? line.slice(1) : line) + "\n";
          }
          continue;
        }
        if (pendingLogin) {
          const value = Buffer.from(line, "base64").toString("utf8");
          if (pendingLogin === "user") {
            login = { user: value, pass: "" };
            pendingLogin = "pass";
            reply("334 UGFzc3dvcmQ6");
          } else {
            login = { user: login?.user ?? "", pass: value };
            pendingLogin = null;
            if (state.mode === "auth-fail") {
              login = null;
              reply("535 5.7.8 Authentication credentials invalid");
            } else reply("235 2.7.0 Authentication successful");
          }
          continue;
        }
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          socket.write("250-test.local\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
        } else if (upper.startsWith("AUTH PLAIN")) {
          const [, user = "", pass = ""] = Buffer.from(line.slice(11).trim(), "base64").toString("utf8").split("\u0000");
          if (state.mode === "auth-fail") reply("535 5.7.8 Authentication credentials invalid");
          else {
            login = { user, pass };
            reply("235 2.7.0 Authentication successful");
          }
        } else if (upper.startsWith("AUTH LOGIN")) {
          pendingLogin = "user";
          reply("334 VXNlcm5hbWU6");
        } else if (upper.startsWith("MAIL FROM:")) {
          mail.from = line.slice(10).trim().replace(/^<|>.*$/g, "");
          reply("250 2.1.0 Ok");
        } else if (upper.startsWith("RCPT TO:")) {
          mail.to.push(line.slice(8).trim().replace(/^<|>.*$/g, ""));
          reply("250 2.1.5 Ok");
        } else if (upper === "DATA") {
          inData = true;
          reply("354 End data with <CR><LF>.<CR><LF>");
        } else if (upper === "RSET" || upper === "NOOP") {
          reply("250 2.0.0 Ok");
        } else if (upper === "QUIT") {
          reply("221 2.0.0 Bye");
          socket.end();
        } else {
          reply("502 5.5.2 Command not recognized");
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.port = (server.address() as AddressInfo).port;
  state.close = async () => {
    for (const s of sockets) s.destroy();
    await new Promise((resolve) => server.close(resolve));
  };
  return state;
}
