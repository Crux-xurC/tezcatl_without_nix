

defmodule AllowedOriginsTest do
  use ExUnit.Case, async: false

  @env "TEZCATL_ALLOWED_ORIGINS"

  @defaults [
    "http://127.0.0.1:4001",
    "http://localhost:4001",
    "http://127.0.0.1:4100",
    "http://localhost:4100"
  ]

  setup do
    prev = System.get_env(@env)
    System.delete_env(@env)

    on_exit(fn ->
      if prev, do: System.put_env(@env, prev), else: System.delete_env(@env)
    end)

    :ok
  end

  describe "list/0" do
    test "no env var -> the built-in default list" do
      assert AllowedOrigins.list() == @defaults
    end

    test "env var replaces the defaults (does not add to them)" do
      System.put_env(@env, "https://example.test:8443,https://app.example.test")

      assert AllowedOrigins.list() == [
               "https://example.test:8443",
               "https://app.example.test"
             ]

      for d <- @defaults, do: refute(d in AllowedOrigins.list())
    end

    test "single entry works" do
      System.put_env(@env, "http://127.0.0.1:9999")
      assert AllowedOrigins.list() == ["http://127.0.0.1:9999"]
    end

    test "surrounding whitespace on entries is trimmed" do
      System.put_env(@env, "  http://a.test  , http://b.test\t")
      assert AllowedOrigins.list() == ["http://a.test", "http://b.test"]
    end

    test "blank entries are dropped, real ones kept" do
      System.put_env(@env, "http://a.test,,  ,http://b.test")
      assert AllowedOrigins.list() == ["http://a.test", "http://b.test"]
    end

    test "whitespace-/comma-only value falls back to the defaults" do
      System.put_env(@env, "   ,  , \t")
      assert AllowedOrigins.list() == @defaults
    end

    test "empty string falls back to the defaults" do
      System.put_env(@env, "")
      assert AllowedOrigins.list() == @defaults
    end
  end

  describe "check/1" do
    test ":undefined (headerless, non-browser client) -> :ok" do
      assert AllowedOrigins.check(:undefined) == :ok
    end

    test "an Origin in the list -> :ok" do
      assert AllowedOrigins.check("http://127.0.0.1:4001") == :ok
    end

    test "an Origin not in the list -> {:error, origin}" do
      assert AllowedOrigins.check("http://evil.example") ==
               {:error, "http://evil.example"}
    end

    test "a non-binary, non-:undefined value -> {:error, value}" do
      assert AllowedOrigins.check(123) == {:error, 123}
      assert AllowedOrigins.check(nil) == {:error, nil}
    end

    test "honours the env override" do
      System.put_env(@env, "http://ok.test")
      assert AllowedOrigins.check("http://ok.test") == :ok
      assert AllowedOrigins.check("http://127.0.0.1:4001") ==
               {:error, "http://127.0.0.1:4001"}
    end
  end

  describe "acao/1" do
    test "an allow-listed Origin is echoed back verbatim" do
      assert AllowedOrigins.acao("http://localhost:4100") == "http://localhost:4100"
    end

    test "a disallowed Origin -> nil (no CORS header)" do
      assert AllowedOrigins.acao("http://evil.example") == nil
    end

    test ":undefined -> nil (nothing to echo)" do
      assert AllowedOrigins.acao(:undefined) == nil
    end
  end
end
