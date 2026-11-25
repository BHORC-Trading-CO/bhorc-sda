// Завершение подключения Guard (SDA-63): после отмены новых запросов нет, подтверждённый успех сохраняется,
// потерянный ответ — неизвестный исход, а не ошибка. Сеть — только перехваченная nock.
import nock from "nock";
import finalizeAddAuthenticator from "../finalizeAddAuthenticator";
import { isLostResponse, isUnknownOutcome, unknownOutcome } from "../guardOutcome";

const HOST = "https://api.steampowered.com";
const PATH = /FinalizeAddAuthenticator/;
const finalize = (signal?: AbortSignal) => finalizeAddAuthenticator({
    accessToken: "fake", steamID64: "76561198000000001", sharedSecret: "c2VjcmV0", activationCode: "12345",
    serverTime: Math.floor(Date.now() / 1000), proxyUrl: null, signal,
});
const WANT_MORE = { response: { success: true, want_more: true, status: 2 } };
const DONE = { response: { success: true, want_more: false, status: 2 } };
let posts: number;

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());
beforeEach(() => { posts = 0; });
afterEach(() => nock.cleanAll());
const reply = (...replies: (() => [number, unknown])[]) => {
    for (const make of replies) nock(HOST).post(PATH).reply(() => { posts++; const [status, body] = make(); return [status, body as any]; });
};

it("want_more is retried until Steam is done", async () => {
    reply(() => [200, WANT_MORE], () => [200, DONE]);
    await finalize(new AbortController().signal);
    expect(posts).toBe(2);
});

it("an abort during a request sends no further one (V62-7)", async () => {
    const run = new AbortController();
    reply(() => { run.abort(); return [200, WANT_MORE]; }, () => [200, DONE]);
    await expect(finalize(run.signal)).rejects.toBe("abort");
    expect(posts).toBe(1);
});

it("a success that was already on its way is kept", async () => {
    const run = new AbortController();
    reply(() => { run.abort(); return [200, DONE]; });
    await expect(finalize(run.signal)).resolves.toBeUndefined();
});

it("an aborted run sends nothing at all", async () => {
    const run = new AbortController();
    run.abort();
    reply(() => [200, DONE]);
    await expect(finalize(run.signal)).rejects.toBe("abort");
    expect(posts).toBe(0);
});

it.each([
    ["no status and no success", () => [200, { response: {} }]],
    ["no response object", () => [200, "<html></html>"]],
    ["a server error", () => [502, "bad gateway"]],
])("%s is an unknown outcome (V62-5)", async (_name, make) => {
    reply(make as any);
    expect(isUnknownOutcome(await finalize().catch(err => err))).toBe(true);
});

it("a dropped connection is an unknown outcome", async () => {
    nock(HOST).post(PATH).replyWithError({ message: "socket hang up", code: "ECONNRESET" });
    const err = await finalize().catch(err => err);
    expect(isUnknownOutcome(err)).toBe(true);
    expect(err.message).toBe("socket hang up");
});

it.each([
    ["Steam's refusal", () => [200, { response: { success: false, status: 88 } }], "Error 88"],
    ["a wrong activation code", () => [200, { response: { success: false, status: 89 } }], "Invalid activation code"],
    ["an HTTP refusal", () => [401, {}], "HTTP error 401"],
])("%s is a definite one", async (_name, make, message) => {
    reply(make as any);
    const err = await finalize().catch(err => err);
    expect(err.message).toBe(message);
    expect(isUnknownOutcome(err)).toBe(false);
});

it.each([
    [{ eresult: 29, message: "Error 29" }, false],
    [{ code: 429, message: "HTTP error 429" }, false],
    [{ code: 503, message: "HTTP error 503" }, true],
    [{ code: "ECONNREFUSED", syscall: "connect" }, false],
    [{ code: "ENOTFOUND", syscall: "getaddrinfo" }, false],
    [{ code: "ETIMEDOUT", connect: true }, false],
    [{ code: "ECONNRESET", message: "tunneling socket could not be established, statusCode=407" }, false],
    [{ message: "Not Logged In" }, false],
    [{ code: "ESOCKETTIMEDOUT", connect: false }, true],
    [{ code: "ECONNRESET", syscall: "read" }, true],
    [{ message: "Malformed JSON response" }, true],
    [undefined, true],
])("lost response %j: %s", (err, lost) => {
    expect(isLostResponse(err)).toBe(lost);
});

it("only the marked error is an unknown outcome", () => {
    expect(isUnknownOutcome(unknownOutcome("x"))).toBe(true);
    for (const err of [undefined, null, "abort", new Error("x")]) expect(isUnknownOutcome(err)).toBe(false);
});
