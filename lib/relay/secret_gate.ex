defmodule SecretGate do
  # Poca's secret, checked for every route (D-poca-secret). A cowboy
  # middleware after AllowedHosts and ahead of the router, like it.
  #
  # Poca makes a secret per run and starts tezcatl's row of its box with it in
  # POCA_SECRET; on the pages' requests to the relay (same row: :4001 and
  # :4100) it adds the header X-Poca-Secret. So with a secret:
  #
  #   OPTIONS                      a CORS preflight, answered here: Poca
  #                                adds the header before Chromium's CORS
  #                                check, so every fetch from :4001 is
  #                                preflighted for X-Poca-Secret -- the
  #                                handlers' own OPTIONS allow content-type
  #                                only. An allowed Origin gets the method
  #                                and headers it asks for; any other, none
  #   WebSocket, no Origin         through: not a browser (Xipe Totec's /lsp).
  #                                A browser always sends Origin on a
  #                                WebSocket and page JS cannot drop it; local
  #                                programs of the same user are not what this
  #                                guards against (they read the files, and the
  #                                relay's environment, as it is)
  #   WebSocket with an Origin     a ticket (?ticket=, Tickets) or the header,
  #                                else 403
  #   any other HTTP               the header, else 401 -- whatever the Origin:
  #                                a same-origin GET or a navigation has none
  #
  # Without POCA_SECRET the relay does not start, unless TEZCATL_AUTH=off says
  # to run without (`t --no-auth`, the E2E stack). A secret wins over "off".

  @behaviour :cowboy_middleware
  require Logger

  @key {__MODULE__, :mode}

  @doc "{:secret, s} | :off | :missing, from the environment."
  def mode_from_env do
    case System.get_env("POCA_SECRET") do
      s when is_binary(s) and s != "" -> {:secret, s}
      _ -> if System.get_env("TEZCATL_AUTH") == "off", do: :off, else: :missing
    end
  end

  @doc "Fixes the mode for the listener (main.exs, once, before it starts)."
  def configure(mode), do: :persistent_term.put(@key, mode)

  def mode, do: :persistent_term.get(@key, :missing)

  @doc """
  The verdict for one request. `info`: method, websocket (bool), origin
  (binary or :undefined), header (binary or :undefined), ticket (binary or
  nil). `take` consumes a ticket. -> :ok | {:deny, status, body}
  """
  def decide(mode, info, take \\ &Tickets.take/1)

  def decide(:off, _info, _take), do: :ok
  def decide(:missing, _info, _take), do: {:deny, 503, "the relay has no secret\n"}
  def decide({:secret, _}, %{method: "OPTIONS"}, _take), do: :ok
  def decide({:secret, _}, %{websocket: true, origin: :undefined}, _take), do: :ok

  def decide({:secret, s}, %{websocket: true} = info, take) do
    if secret_ok?(s, info.header) or take.(info.ticket),
      do: :ok,
      else: {:deny, 403, "no good ticket\n"}
  end

  def decide({:secret, s}, info, _take) do
    if secret_ok?(s, info.header),
      do: :ok,
      else: {:deny, 401, "no secret: open tezcatl from Poca\n"}
  end

  defp secret_ok?(s, given) when is_binary(given) and byte_size(given) == byte_size(s),
    do: :crypto.hash_equals(given, s)

  defp secret_ok?(_s, _given), do: false

  @impl true
  def execute(req, env) do
    case {mode(), :cowboy_req.method(req)} do
      {{:secret, _}, "OPTIONS"} -> {:stop, preflight(req)}
      _ -> check(req, env)
    end
  end

  # The answer to a preflight (no body; the actual request is checked when it
  # comes).
  def preflight_headers(origin, method, headers) do
    case AllowedOrigins.acao(origin) do
      nil ->
        %{"vary" => "origin"}

      allowed ->
        %{
          "vary" => "origin",
          "access-control-allow-origin" => allowed,
          "access-control-allow-methods" => method || "GET",
          "access-control-allow-headers" => headers || "x-poca-secret",
          "access-control-max-age" => "600"
        }
    end
  end

  defp preflight(req) do
    h = fn name -> :cowboy_req.header(name, req, nil) end

    headers =
      preflight_headers(
        h.("origin") || :undefined,
        h.("access-control-request-method"),
        h.("access-control-request-headers")
      )

    :cowboy_req.reply(204, headers, "", req)
  end

  defp check(req, env) do
    info = %{
      method: :cowboy_req.method(req),
      websocket: String.downcase(:cowboy_req.header("upgrade", req, "")) == "websocket",
      origin: :cowboy_req.header("origin", req, :undefined),
      header: :cowboy_req.header("x-poca-secret", req, :undefined),
      ticket: ticket(req)
    }

    case decide(mode(), info) do
      :ok ->
        {:ok, req, env}

      {:deny, status, body} ->
        # the path without its query: no ticket in the log
        Logger.info("relay: refusing #{:cowboy_req.path(req)} (#{status}), #{String.trim(body)}")
        req = :cowboy_req.reply(status, deny_headers(info.origin), body, req)
        {:stop, req}
    end
  end

  # an allowed page may read the refusal: it can tell "not opened from Poca"
  # from the relay being down
  defp deny_headers(origin) do
    headers = %{"content-type" => "text/plain", "vary" => "origin"}

    case AllowedOrigins.acao(origin) do
      nil -> headers
      allowed -> Map.put(headers, "access-control-allow-origin", allowed)
    end
  end

  defp ticket(req) do
    case List.keyfind(:cowboy_req.parse_qs(req), "ticket", 0) do
      {_, t} when is_binary(t) -> t
      _ -> nil
    end
  end
end
