defmodule EnvHandler do
  # /env: the projects' environments (D-project-env, ProjectEnv).
  #
  #   GET  /env?path=<from the FS root>
  #        -> {"found":false,"reason":...}                         no project around the path
  #        |  {"found":true,"kept":<was it kept before>, "root","marker","command","ok","reason",
  #            "pathAdded":[dirs put before the relay's PATH],"set":[names],"unset":[names]}
  #           (asks for it when not kept, and waits)
  #   POST /env/reload[?path=<from the FS root>]
  #        -> {"dropped":[roots]}   what was kept of that path's project (none: of all) is thrown away
  #
  # GET is CORS-permissive like GET /lsp/servers; POST is Origin-strict like DELETE /lsp/servers/:key.
  require Logger

  def init(req0, state) do
    origin = :cowboy_req.header("origin", req0, :undefined)
    qs = :cowboy_req.parse_qs(req0)
    path = case :proplists.get_value("path", qs, "") do v when is_binary(v) -> v; _ -> "" end
    req = handle(:cowboy_req.method(req0), :cowboy_req.path(req0), path, origin, req0)
    {:ok, req, state}
  end

  defp handle("OPTIONS", _route, _path, origin, req) do
    headers =
      case AllowedOrigins.acao(origin) do
        nil ->
          %{"vary" => "origin"}

        allowed ->
          %{
            "vary" => "origin",
            "access-control-allow-origin" => allowed,
            "access-control-allow-methods" => "GET, POST, OPTIONS",
            "access-control-allow-headers" => "content-type",
            "access-control-max-age" => "600"
          }
      end

    :cowboy_req.reply(204, headers, "", req)
  end

  defp handle("GET", "/env", path, origin, req) do
    case project_of(path) do
      {:error, why} ->
        json(400, %{"error" => why}, origin, req)

      {:none, why} ->
        json(200, %{"found" => false, "reason" => why}, origin, req)

      {:ok, w} ->
        kept = ProjectEnv.kept?(w.root, w.entry)

        body =
          case ProjectEnv.await(w.root, w.entry, w.timeout_ms) do
            {:error, :timeout} ->
              %{"found" => true, "kept" => false, "root" => w.root, "marker" => w.entry.marker,
                "ok" => false, "reason" => "no answer yet"}

            r ->
              Map.merge(ProjectEnv.describe(r), %{"found" => true, "kept" => kept, "format" => r.format})
          end

        json(200, body, origin, req)
    end
  end

  defp handle("POST", "/env/reload", path, origin, req) do
    case AllowedOrigins.check(origin) do
      {:error, o} ->
        Logger.info("env: rejecting a reload, disallowed Origin #{inspect(o)}")
        :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)

      :ok when path == "" ->
        json(200, %{"dropped" => ProjectEnv.forget(:all)}, origin, req)

      :ok ->
        case project_of(path) do
          {:error, why} -> json(400, %{"error" => why}, origin, req)
          {:none, why} -> json(200, %{"dropped" => [], "reason" => why}, origin, req)
          {:ok, w} -> json(200, %{"dropped" => ProjectEnv.forget([w.root]), "root" => w.root}, origin, req)
        end
    end
  end

  defp handle(_m, _route, _path, origin, req), do: json(405, %{"error" => "method not allowed"}, origin, req)

  # a path from the FS root -> {:ok, where} | {:none, reason} | {:error, reason}
  defp project_of(path) do
    fs_root = System.get_env("TEZCATL_FS_ROOT") || File.cwd!()

    with {:ok, abs} <- FsValidate.resolve(fs_root, path),
         true <- File.exists?(abs) || {:error, "#{path} does not exist"} do
      dir = if File.dir?(abs), do: abs, else: Path.dirname(abs)

      case ProjectEnv.where(dir) do
        :none -> {:none, "no marker of project_env.json from #{if path == "", do: "the FS root", else: path} up to the FS root"}
        {:error, why} -> {:error, why}
        {:ok, w} -> {:ok, w}
      end
    end
  end

  defp json(status, map, origin, req) do
    headers = %{"content-type" => "application/json; charset=utf-8", "cache-control" => "no-store", "vary" => "origin"}

    headers =
      case AllowedOrigins.acao(origin) do
        nil -> headers
        allowed -> Map.put(headers, "access-control-allow-origin", allowed)
      end

    :cowboy_req.reply(status, headers, IO.iodata_to_binary(:json.encode(map)), req)
  end
end
