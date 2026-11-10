defmodule LspHandler do
  # GET  /lsp/servers          -- list the running language servers (permissive
  #                               CORS, like GET /windows)
  # DELETE /lsp/servers/:key   -- stop one (Origin-gated, like DELETE /windows/:id)
  require Logger

  def init(req0, state) do
    origin = :cowboy_req.header("origin", req0, :undefined)
    method = :cowboy_req.method(req0)
    key = :cowboy_req.binding(:key, req0, :undefined)
    req = handle(method, key, origin, req0)
    {:ok, req, state}
  end

  defp handle("GET", :undefined, origin, req) do
    body = IO.iodata_to_binary(:json.encode(%{"servers" => LspRegistry.list()}))
    :cowboy_req.reply(200, cors(base_headers(), origin), body, req)
  end

  defp handle("OPTIONS", _key, origin, req) do
    headers =
      case AllowedOrigins.acao(origin) do
        nil ->
          %{"vary" => "origin"}

        allowed ->
          %{
            "vary" => "origin",
            "access-control-allow-origin" => allowed,
            "access-control-allow-methods" => "GET, DELETE, OPTIONS",
            "access-control-allow-headers" => "content-type",
            "access-control-max-age" => "600"
          }
      end

    :cowboy_req.reply(204, headers, "", req)
  end

  defp handle("DELETE", key, origin, req) when is_binary(key) do
    case AllowedOrigins.check(origin) do
      {:error, o} ->
        Logger.info("lsp: rejecting DELETE, disallowed Origin #{inspect(o)}")
        :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)

      :ok ->
        {status, body} =
          case LspRegistry.stop(key) do
            :ok -> {200, ~s({"stopped":true,"key":) <> jstr(key) <> "}"}
            :not_found -> {404, ~s({"stopped":false,"key":) <> jstr(key) <> "}"}
          end

        :cowboy_req.reply(status, cors(base_headers(), origin), body, req)
    end
  end

  defp handle("DELETE", :undefined, origin, req) do
    :cowboy_req.reply(404, cors(base_headers(), origin), ~s({"stopped":false}), req)
  end

  defp handle(_method, _key, origin, req) do
    :cowboy_req.reply(
      405,
      cors(Map.put(base_headers(), "allow", "GET, DELETE, OPTIONS"), origin),
      ~s({"error":"method not allowed"}),
      req
    )
  end

  defp base_headers do
    %{
      "content-type" => "application/json; charset=utf-8",
      "cache-control" => "no-store",
      "vary" => "origin"
    }
  end

  defp cors(headers, origin) do
    case AllowedOrigins.acao(origin) do
      nil -> headers
      allowed -> Map.put(headers, "access-control-allow-origin", allowed)
    end
  end

  defp jstr(v) when is_binary(v) do
    IO.iodata_to_binary([
      ?",
      v
      |> String.replace("\\", "\\\\")
      |> String.replace("\"", "\\\"")
      |> String.replace("\n", "\\n"),
      ?"
    ])
  end

  defp jstr(v), do: jstr(to_string(v))
end
