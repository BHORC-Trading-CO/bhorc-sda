import RequestPromise from "../Request";

const proxy = {
  host: "127.0.0.1",
  port: 8888,
  username: "user",
  password: "pass",
} as any;

describe("RequestPromise — fail-closed по умолчанию (HIGH-3)", () => {
  it("без прокси бросает (защита от утечки реального IP)", () => {
    expect(() => new RequestPromise(undefined)).toThrow(/без прокси запрещён/);
    expect(() => new RequestPromise(null)).toThrow(/без прокси запрещён/);
  });

  it("без прокси, но allowDirect=true — разрешает прямой запрос", () => {
    expect(() => new RequestPromise(undefined, true)).not.toThrow();
  });

  it("с прокси — создаётся без ошибок", () => {
    expect(() => new RequestPromise(proxy)).not.toThrow();
  });
});
