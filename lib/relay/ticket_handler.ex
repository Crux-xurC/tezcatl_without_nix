defmodule TicketHandler do
  # GET /ticket -> {"ticket": "..."} for a page's next WebSocket
  # (D-poca-secret). SecretGate has already checked the request's
  # X-Poca-Secret; here a ticket is only issued. A relay running without a
  # secret (TEZCATL_AUTH=off) answers {"ticket": null}: the page then opens
  # its WebSocket as it is (lib/core/ticket.js).

  def init(req0, state) do
    origin = :cowboy_req.header("origin", req0, :undefined)
    req = handle(:cowboy_req.method(req0), origin, req0)
    {:ok, req, state}
  end

  defp handle("GET", origin, req) do
    body =
      case SecretGate.mode() do
        {:secret, _} -> ~s({"ticket":") <> Tickets.issue() <> ~s("})
        _ -> ~s({"ticket":null})
      end

    headers = %{"content-type" => "application/json", "cache-control" => "no-store"}
    :cowboy_req.reply(200, cors(headers, origin), body, req)
  end

  defp handle("OPTIONS", origin, req) do
    headers = %{"access-control-allow-methods" => "GET, OPTIONS", "access-control-max-age" => "600"}
    :cowboy_req.reply(204, cors(headers, origin), "", req)
  end

  defp handle(_method, origin, req) do
    :cowboy_req.reply(405, cors(%{"allow" => "GET, OPTIONS"}, origin), "", req)
  end

  # a ticket is read cross-origin (:4001 -> :4100): only by the allowed origins
  defp cors(headers, origin) do
    case AllowedOrigins.acao(origin) do
      nil -> Map.put(headers, "vary", "origin")
      allowed -> Map.merge(headers, %{"vary" => "origin", "access-control-allow-origin" => allowed})
    end
  end
end
