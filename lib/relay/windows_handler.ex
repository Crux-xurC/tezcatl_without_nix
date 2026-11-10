defmodule WindowsHandler do
  require Logger

  def init(req0, state) do
    origin = :cowboy_req.header("origin", req0, :undefined)
    method = :cowboy_req.method(req0)
    id = :cowboy_req.binding(:id, req0, :undefined)
    req = handle(method, id, origin, req0)
    {:ok, req, state}
  end

  defp handle("GET", :undefined, origin, req) do
    body = to_json(VentUplink.alive?(), VentUplink.list())
    :cowboy_req.reply(200, cors(base_headers(), origin), body, req)
  end

  defp handle("OPTIONS", _id, origin, req) do
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

  defp handle("DELETE", id, origin, req) when is_binary(id) do
    case AllowedOrigins.check(origin) do
      {:error, o} ->
        Logger.info("windows: rejecting DELETE, disallowed Origin #{inspect(o)}")
        :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)

      :ok ->
        {status, body} =
          case VentUplink.evict(id) do
            {:ok, name} ->
              {200, ~s({"evicted":true,"id":) <> jstr(id) <> ~s(,"name":) <> jstr(name) <> "}"}

            :not_found ->
              {404, ~s({"evicted":false,"id":) <> jstr(id) <> "}"}
          end

        :cowboy_req.reply(status, cors(base_headers(), origin), body, req)
    end
  end

  defp handle("DELETE", :undefined, origin, req) do
    :cowboy_req.reply(404, cors(base_headers(), origin), ~s({"evicted":false}), req)
  end

  defp handle(_method, _id, origin, req) do
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

  defp to_json(uplink, entries) do
    windows = "[" <> (entries |> Enum.map(&entry_json/1) |> Enum.join(",")) <> "]"
    ~s({"uplink":) <> to_string(uplink) <> ~s(,"windows":) <> windows <> "}"
  end

  defp entry_json(%{id: id, name: name}) do
    ~s({"id":) <> jstr(id) <> ~s(,"name":) <> jstr(name) <> "}"
  end

  defp jstr(nil), do: "null"
  defp jstr(v) when is_binary(v), do: IO.iodata_to_binary([?", escape(v), ?"])
  defp jstr(v), do: jstr(to_string(v))

  defp escape(s) do
    s
    |> String.replace("\\", "\\\\")
    |> String.replace("\"", "\\\"")
    |> String.replace("\n", "\\n")
    |> String.replace("\r", "\\r")
    |> String.replace("\t", "\\t")
  end
end
