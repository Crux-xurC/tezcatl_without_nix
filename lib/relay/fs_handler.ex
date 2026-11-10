
defmodule FsHandler do
  require Logger

  @max_read 5 * 1024 * 1024
  @max_write 5 * 1024 * 1024

  def init(req0, state) do
    origin = :cowboy_req.header("origin", req0, :undefined)
    method = :cowboy_req.method(req0)
    route = :cowboy_req.path(req0)
    qs = :cowboy_req.parse_qs(req0)
    path_q =
      case :proplists.get_value("path", qs, "") do
        p when is_binary(p) -> p
        _ -> ""
      end

    req =
      case route do
        "/fs/rename" ->
          to_q =
            case :proplists.get_value("to", qs, "") do
              t when is_binary(t) -> t
              _ -> ""
            end

          rename(method, path_q, to_q, origin, req0)

        "/fs/grep" ->
          q = fn k -> case :proplists.get_value(k, qs, "") do v when is_binary(v) -> v; _ -> "" end end
          grep(method, path_q, q.("q"), q.("limit"), origin, req0)

        _ ->
          handle(method, route, path_q, origin, req0)
      end

    {:ok, req, state}
  end

  # -- writes: what the editor needs to edit safely --------------
  #
  # PUT /fs/write takes an optional `x-tezcatl-base` header: what the writer
  # believes is on disk now -- "sha256:<hex>" of the text it opened (a UTF-8
  # BOM is not counted: the browser's text() drops it), or "absent" for a new
  # file. When the disk says otherwise the write is refused with 409
  # {"code":"changed","current":...}, and nothing is written; the editor then
  # lets the person choose (`:w!` writes without the header, `:e!` reads the
  # disk again). Without the header the write is last-write-wins
  # (the lists' data files, a forced save).
  #
  # A file is never written into a directory that does not exist (404
  # {"code":"no_parent"}): directories are made in the terminal.
  #
  # DELETE /fs/delete?path= removes a regular file (the same optional base
  # check). POST /fs/rename?path=&to= moves a regular file to a path that does
  # not exist yet (409 {"code":"exists"}), into an existing directory.
  # All three are Origin-strict like /fs/write.

  defp handle("OPTIONS", _route, _path, origin, req) do
    headers =
      case AllowedOrigins.acao(origin) do
        nil ->
          %{"vary" => "origin"}

        allowed ->
          %{
            "vary" => "origin",
            "access-control-allow-origin" => allowed,
            "access-control-allow-methods" => "GET, PUT, POST, DELETE, OPTIONS",
            "access-control-allow-headers" => "content-type, x-tezcatl-base",
            "access-control-max-age" => "600"
          }
      end

    :cowboy_req.reply(204, headers, "", req)
  end

  defp handle("GET", "/fs", path_q, origin, req) do
    case locate(path_q) do
      {:error, reason} ->
        json(400, ~s({"error":) <> jstr(reason) <> "}", origin, req)

      {:ok, abs, which} ->
        cond do
          not File.exists?(abs) ->
            json(404, ~s({"error":"no such path"}), origin, req)

          not File.dir?(abs) ->
            json(400, ~s({"error":"not a directory"}), origin, req)

          true ->
            # a directory that cannot be listed (no permission) is an answer
            # in JSON like the others, not a crash with an empty 500
            case File.ls(abs) do
              {:ok, names} ->
                json(200, dir_json(rel_of(path_q), abs, names, base_abs(which)), origin, req)

              {:error, :eacces} ->
                json(403, ~s({"error":"permission denied"}), origin, req)

              {:error, e} ->
                json(500, ~s({"error":) <> jstr(inspect(e)) <> "}", origin, req)
            end
        end
    end
  end

  defp handle("GET", "/fs/read", path_q, origin, req) do
    case locate(path_q) do
      {:error, reason} ->
        json(400, ~s({"error":) <> jstr(reason) <> "}", origin, req)

      {:ok, abs, _which} ->
        cond do
          not File.exists?(abs) ->
            json(404, ~s({"error":"no such file"}), origin, req)

          not File.regular?(abs) ->
            json(400, ~s({"error":"not a regular file"}), origin, req)

          file_size(abs) > @max_read ->
            json(413, ~s({"error":"file too large"}), origin, req)

          true ->
            case File.read(abs) do
              {:ok, bytes} ->
                read_reply(bytes, origin, req)

              {:error, e} ->
                json(500, ~s({"error":) <> jstr(inspect(e)) <> "}", origin, req)
            end
        end
    end
  end

  defp handle(method, "/fs/write", path_q, origin, req) when method in ["PUT", "POST"] do
    case AllowedOrigins.check(origin) do
      {:error, o} ->
        Logger.info("fs: rejecting write, disallowed Origin #{inspect(o)}")
        :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)

      :ok ->
        case locate(path_q) do
          {:error, reason} ->
            json(400, ~s({"error":) <> jstr(reason) <> "}", origin, req)

          {:ok, abs, which} ->
            write_file(abs, which, path_q, origin, req)
        end
    end
  end

  defp handle("DELETE", "/fs/delete", path_q, origin, req) do
    with_write_gate(origin, req, fn ->
      case locate(path_q) do
        {:error, reason} ->
          json(400, ~s({"error":) <> jstr(reason) <> "}", origin, req)

        {:ok, abs, _which} ->
          cond do
            not File.exists?(abs) ->
              json(404, ~s({"error":"no such file"}), origin, req)

            not File.regular?(abs) ->
              json(400, ~s({"error":"not a regular file"}), origin, req)

            true ->
              case check_base(abs, base_header(req)) do
                {:changed, current} ->
                  changed(current, origin, req)

                {:unreadable, why} ->
                  unreadable(why, origin, req)

                :ok ->
                  case File.rm(abs) do
                    :ok ->
                      json(
                        200,
                        ~s({"ok":true,"path":) <> jstr(rel_of(path_q)) <> "}",
                        origin,
                        req
                      )

                    {:error, e} ->
                      json(500, ~s({"error":) <> jstr(inspect(e)) <> "}", origin, req)
                  end
              end
          end
      end
    end)
  end

  # GET /fs/stat?path= -- what is on disk now, without its text:
  #   {"path","exists":true,"size","mtime","base"}
  # mtime in seconds since the epoch, base as x-tezcatl-base has it
  # ("sha256:<hex>" of the text, a BOM not counted), so the editor compares it
  # with the one it opened. A missing file is {"exists":false,"base":"absent"};
  # one that cannot be read or is over the size /fs/read gives out has
  # "base":null. Asked only when a person asks (check update, code_diff's
  # header): nothing polls it.
  defp handle("GET", "/fs/stat", path_q, origin, req) do
    case locate(path_q) do
      {:error, reason} ->
        json(400, ~s({"error":) <> jstr(reason) <> "}", origin, req)

      {:ok, abs, _which} ->
        rel = jstr(rel_of(path_q))

        case File.stat(abs, time: :posix) do
          {:error, :enoent} ->
            json(200, ~s({"path":) <> rel <> ~s(,"exists":false,"base":"absent"}), origin, req)

          {:error, e} ->
            json(500, ~s({"error":) <> jstr(inspect(e)) <> "}", origin, req)

          {:ok, %File.Stat{type: :regular, size: size, mtime: mtime}} ->
            base =
              case size <= @max_read && disk_base(abs) do
                "sha256:" <> _ = b -> jstr(b)
                _ -> "null"
              end

            json(
              200,
              ~s({"path":) <> rel <> ~s(,"exists":true,"size":) <> Integer.to_string(size) <>
                ~s(,"mtime":) <> Integer.to_string(mtime) <> ~s(,"base":) <> base <> "}",
              origin,
              req
            )

          {:ok, _} ->
            json(400, ~s({"error":"not a regular file"}), origin, req)
        end
    end
  end

  # POST /fs/clone?path=<file of the FS root>&slots=<n> -- the file as it is on
  # disk copied to ~work/clone/<the same path> (the work place), for a second
  # code_editor on a file another has open: a file of its own, so
  # the two never write over each other and no project grows a stray file.
  # Answers {"ok":true,"to":"~work/clone/...","dropped":[...]}. The clones are
  # temporary: at most `slots` (1..100, default 10) are kept, the oldest by
  # their time of writing dropped -- never the one just made. A file that is
  # not on disk is 404 (the editor opens the clone's path as a new file).
  # Origin-strict, as every change.
  @clone_slots 10

  defp handle("POST", "/fs/clone", path_q, origin, req) do
    with_write_gate(origin, req, fn ->
      slots =
        case Integer.parse(to_string(:proplists.get_value("slots", :cowboy_req.parse_qs(req), ""))) do
          {n, ""} when n >= 1 -> min(n, 100)
          _ -> @clone_slots
        end

      case locate(path_q) do
        {:error, reason} ->
          json(400, ~s({"error":) <> jstr(reason) <> "}", origin, req)

        {:ok, _abs, :work} ->
          json(400, ~s|{"error":"a file of the work place is not cloned"}|, origin, req)

        {:ok, abs, :root} ->
          cond do
            not File.exists?(abs) ->
              json(404, ~s({"error":"no such file"}), origin, req)

            not File.regular?(abs) ->
              json(400, ~s({"error":"not a regular file"}), origin, req)

            file_size(abs) > @max_read ->
              json(413, ~s({"error":"file too large"}), origin, req)

            true ->
              rel = Path.relative_to(abs, root_abs())
              clone_dir = Path.join(work_root(), "clone")
              to = Path.join(clone_dir, rel)

              with :ok <- File.mkdir_p(Path.dirname(to)),
                   {:ok, bytes} <- File.read(abs),
                   :ok <- FsAtomic.write(to, bytes) do
                dropped = prune_clones(clone_dir, to, slots)

                body =
                  IO.iodata_to_binary(
                    :json.encode(%{
                      "ok" => true,
                      "to" => FsValidate.work_prefix() <> "/clone/" <> rel,
                      "dropped" => Enum.map(dropped, &(FsValidate.work_prefix() <> "/clone/" <> Path.relative_to(&1, clone_dir)))
                    })
                  )

                json(200, body, origin, req)
              else
                {:error, e} -> json(500, ~s({"error":) <> jstr(inspect(e)) <> "}", origin, req)
              end
          end
      end
    end)
  end

  defp handle(_method, _route, _path, origin, req) do
    :cowboy_req.reply(
      405,
      cors(%{"content-type" => "application/json; charset=utf-8", "allow" => "GET, PUT, POST, DELETE, OPTIONS", "vary" => "origin"}, origin),
      ~s({"error":"method not allowed"}),
      req
    )
  end

  # Only UTF-8 text is given out: the browser decodes
  # the answer as UTF-8, so another encoding (or a binary) would come back
  # with U+FFFD in place of its bytes, its hash would never match the disk
  # (a save "changed on disk" that nobody changed), and `:w!` would write
  # the replaced text over the file. What cannot be written back as it was
  # read is not opened.
  defp read_reply(bytes, origin, req) do
    if String.valid?(bytes) do
      :cowboy_req.reply(
        200,
        cors(%{"content-type" => "text/plain; charset=utf-8", "cache-control" => "no-store", "vary" => "origin"}, origin),
        bytes,
        req
      )
    else
      json(415, ~s|{"error":"not UTF-8 text (a binary, or another encoding)","code":"not_utf8"}|, origin, req)
    end
  end

  defp write_file(abs, which, path_q, origin, req) do
    # the work place is tezcatl's own: its directories are made as needed
    # (a clone keeps the path of its file). The FS root's never are.
    if which == :work, do: File.mkdir_p(Path.dirname(abs))

    cond do
      File.dir?(abs) ->
        json(400, ~s({"error":"path is a directory"}), origin, req)

      not File.dir?(Path.dirname(abs)) ->
        no_parent(abs, which, origin, req)

      true ->
        case check_base(abs, base_header(req)) do
          {:changed, current} -> changed(current, origin, req)
          {:unreadable, why} -> unreadable(why, origin, req)
          :ok -> write_body(abs, path_q, origin, req)
        end
    end
  end

  defp write_body(abs, path_q, origin, req) do
    case read_full_body(req, @max_write) do
      {:error, :too_large} ->
        json(413, ~s({"error":"body too large"}), origin, req)

      {:ok, body, req} ->
        # a temporary file and rename: never half a file (FsAtomic)
        case FsAtomic.write(abs, body) do
          :ok ->
            json(
              200,
              ~s({"ok":true,"path":) <> jstr(rel_of(path_q)) <>
                ~s(,"bytes":) <> Integer.to_string(byte_size(body)) <> "}",
              origin,
              req
            )

          {:error, e} ->
            json(500, ~s({"error":) <> jstr(inspect(e)) <> "}", origin, req)
        end
    end
  end

  defp rename(method, _path_q, _to_q, origin, req) when method not in ["POST", "OPTIONS"],
    do: handle(method, "/fs/rename", "", origin, req)

  defp rename("OPTIONS", path_q, _to_q, origin, req),
    do: handle("OPTIONS", "/fs/rename", path_q, origin, req)

  defp rename("POST", path_q, to_q, origin, req) do
    with_write_gate(origin, req, fn ->
      with {:ok, from, from_in} <- locate(path_q),
           {:ok, to, to_in} <- locate(to_q) do
        cond do
          # a rename is within one root (the two may be different file systems)
          from_in != to_in ->
            json(400, ~s|{"error":"cannot move between the FS root and the work place","code":"across_roots"}|, origin, req)

          not File.exists?(from) ->
            json(404, ~s({"error":"no such file"}), origin, req)

          not File.regular?(from) ->
            json(400, ~s({"error":"not a regular file"}), origin, req)

          to_q == "" or to == base_abs(to_in) ->
            json(400, ~s|{"error":"no destination (to=)"}|, origin, req)

          File.exists?(to) ->
            json(409, ~s({"error":"the destination exists","code":"exists"}), origin, req)

          not File.dir?(Path.dirname(to)) ->
            no_parent(to, to_in, origin, req)

          true ->
            case File.rename(from, to) do
              :ok ->
                json(
                  200,
                  ~s({"ok":true,"path":) <>
                    jstr(rel_of(path_q)) <> ~s(,"to":) <> jstr(to_q) <> "}",
                  origin,
                  req
                )

              {:error, e} ->
                json(500, ~s({"error":) <> jstr(inspect(e)) <> "}", origin, req)
            end
        end
      else
        {:error, reason} -> json(400, ~s({"error":) <> jstr(reason) <> "}", origin, req)
      end
    end)
  end

  # -- GET /fs/grep?q=<pattern>&path=<dir>&limit=<n> ----
  #
  # The files under `path` (the FS root by default) searched with ripgrep:
  # a regular expression, smart case (all lower case: case is ignored),
  # gitignore and hidden / binary files skipped as rg does. Answers
  #   {"matches":[{"path","line","col","text"}], "truncated": bool}
  # -- path from the FS root, line and col 1-based (col in characters), text
  # the line (trimmed to 400 characters). At most `limit` matches (default
  # 1000, at most 5000); rg is stopped after 10s (truncated). A read, so
  # CORS like /fs/read. Running rg and reading its JSON is FsGrep
  # (lib/relay/fs_grep.exs, split out).
  @grep_limit 1000
  @grep_max 5000

  defp grep("GET", path_q, pattern, limit_q, origin, req) do
    limit = case Integer.parse(limit_q) do {n, ""} when n > 0 -> min(n, @grep_max); _ -> @grep_limit end
    rg = System.find_executable("rg")

    cond do
      pattern == "" ->
        json(400, ~s|{"error":"q= (the pattern) is needed"}|, origin, req)

      rg == nil ->
        json(501, ~s|{"error":"ripgrep (rg) is not on the relay's PATH","code":"no_rg"}|, origin, req)

      true ->
        root = Path.expand(root())

        case FsValidate.resolve(root, String.replace(path_q, ~r{^/+}, "")) do
          {:error, reason} ->
            json(400, ~s({"error":) <> jstr(reason) <> "}", origin, req)

          {:ok, abs} ->
            if File.dir?(abs) or File.regular?(abs) do
              rel = Path.relative_to(abs, root)
              target = if rel in ["", "."] or rel == abs, do: ".", else: rel
              {matches, truncated, err} = FsGrep.run(rg, root, pattern, target, limit)

              if err do
                json(400, ~s({"error":) <> jstr(err) <> ~s(,"code":"rg"}), origin, req)
              else
                body = IO.iodata_to_binary(:json.encode(%{"matches" => matches, "truncated" => truncated}))
                :cowboy_req.reply(200, cors(%{"content-type" => "application/json; charset=utf-8", "cache-control" => "no-store", "vary" => "origin"}, origin), body, req)
              end
            else
              json(404, ~s({"error":"no such path"}), origin, req)
            end
        end
    end
  end

  defp grep(method, _p, _q, _l, origin, req), do: handle(method, "/fs/grep", "", origin, req)

  defp with_write_gate(origin, req, fun) do
    case AllowedOrigins.check(origin) do
      {:error, o} ->
        Logger.info("fs: rejecting a change, disallowed Origin #{inspect(o)}")
        :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)

      :ok ->
        fun.()
    end
  end

  defp base_header(req) do
    case :cowboy_req.header("x-tezcatl-base", req, :undefined) do
      :undefined -> nil
      v -> String.trim(v)
    end
  end

  # nil: no check. "absent": the file must not exist. "sha256:<hex>": its text must hash so.
  defp check_base(_abs, nil), do: :ok
  defp check_base(_abs, ""), do: :ok

  # a file that cannot be read (permissions ...) is not "changed": it cannot
  # be compared, and the editor says so
  defp check_base(abs, base) do
    case disk_base(abs) do
      "unreadable:" <> why -> {:unreadable, why}
      current -> if String.downcase(base) == current, do: :ok, else: {:changed, current}
    end
  end

  defp unreadable(why, origin, req) do
    json(409, ~s({"error":) <> jstr("the file on disk cannot be read (" <> why <> ")") <> ~s(,"code":"unreadable"}), origin, req)
  end

  defp disk_base(abs) do
    case File.read(abs) do
      {:ok, bytes} ->
        "sha256:" <> (:crypto.hash(:sha256, strip_bom(bytes)) |> Base.encode16(case: :lower))

      {:error, :enoent} ->
        "absent"

      {:error, e} ->
        "unreadable:" <> inspect(e)
    end
  end

  defp strip_bom(<<0xEF, 0xBB, 0xBF, rest::binary>>), do: rest
  defp strip_bom(bytes), do: bytes

  defp changed(current, origin, req) do
    json(
      409,
      ~s({"error":"the file on disk is not the one opened","code":"changed","current":) <>
        jstr(current) <> "}",
      origin,
      req
    )
  end

  defp no_parent(abs, which, origin, req) do
    rel = Path.relative_to(Path.dirname(abs), base_abs(which))

    json(
      404,
      ~s({"error":) <> jstr("no such directory: " <> rel) <> ~s(,"code":"no_parent"}),
      origin,
      req
    )
  end

  defp read_full_body(req, cap), do: read_full_body(req, cap, "")

  defp read_full_body(req, cap, acc) do
    case :cowboy_req.read_body(req, %{length: 1_000_000, period: 5_000}) do
      {:ok, chunk, req} ->
        acc = acc <> chunk
        if byte_size(acc) > cap, do: {:error, :too_large}, else: {:ok, acc, req}

      {:more, chunk, req} ->
        acc = acc <> chunk
        if byte_size(acc) > cap, do: {:error, :too_large}, else: read_full_body(req, cap, acc)
    end
  end

  defp root do
    System.get_env("TEZCATL_FS_ROOT") || File.cwd!()
  end

  # The work place: tezcatl's own temporary files (clones of
  # files open elsewhere, the scratch), the second root of /fs -- a path that
  # starts with "~work" is under it (FsValidate.locate). In the user's state
  # directory next to the mirror (`$XDG_STATE_HOME/tezcatl/work`,
  # `~/.local/state/tezcatl/work` without it; TEZCATL_WORK_DIR overrides it):
  # outside every project, the FS root and the pages server's directory. grep
  # does not look there.
  def work_root do
    case System.get_env("TEZCATL_WORK_DIR") do
      d when is_binary(d) and d != "" ->
        Path.expand(d)

      _ ->
        home =
          case System.get_env("XDG_STATE_HOME") do
            "/" <> _ = d -> d
            _ -> Path.expand("~/.local/state")
          end

        Path.join([home, "tezcatl", "work"])
    end
  end

  # At most `slots` clones are kept: the ones written longest ago go (`keep`,
  # the one just made, never), and the directories they leave empty. -> the files dropped
  def prune_clones(clone_dir, keep, slots) do
    files =
      Path.wildcard(Path.join(clone_dir, "**"), match_dot: true)
      |> Enum.filter(&File.regular?/1)
      |> Enum.map(fn f ->
        mtime =
          case File.stat(f, time: :posix) do
            {:ok, %File.Stat{mtime: m}} -> m
            _ -> 0
          end

        {f, mtime}
      end)
      # the newest first; the one just made before any other of the same second
      |> Enum.sort_by(fn {f, m} -> {-m, if(f == keep, do: 0, else: 1), f} end)

    {_kept, drop} = Enum.split(files, slots)
    drop = drop |> Enum.map(&elem(&1, 0)) |> Enum.reject(&(&1 == keep))

    Enum.each(drop, fn f ->
      File.rm(f)
      rmdir_up(Path.dirname(f), clone_dir)
    end)

    drop
  end

  # remove the directories a dropped clone left empty, up to (not including) `top`
  defp rmdir_up(dir, top) do
    if dir != top and String.starts_with?(dir, top <> "/") and File.rmdir(dir) == :ok do
      rmdir_up(Path.dirname(dir), top)
    end
  end

  # the work place is there from the first time it is named
  defp locate(path_q) do
    case FsValidate.locate(root(), work_root(), path_q) do
      {:ok, _abs, :work} = ok ->
        File.mkdir_p(work_root())
        ok

      other ->
        other
    end
  end

  defp base_abs(:work), do: work_root()
  defp base_abs(:root), do: root_abs()

  # Absolute, expanded root -- exposed to GET /fs so a browser-side consumer
  # (compile-intent's cd/root-marker resolution) can build a shell-safe
  # absolute path without knowing TEZCATL_FS_ROOT itself. Not sensitive: it is
  # already implied by every /fs listing.
  defp root_abs, do: Path.expand(root())

  defp rel_of(:undefined), do: ""
  defp rel_of(nil), do: ""
  defp rel_of(""), do: ""
  defp rel_of(p) when is_binary(p), do: p

  defp file_size(abs) do
    case File.stat(abs) do
      {:ok, %File.Stat{size: s}} -> s
      _ -> 0
    end
  end

  defp dir_json(rel, abs, names, root_abs) do
    entries =
      names
      |> Enum.map(fn name ->
        full = Path.join(abs, name)
        dir? = File.dir?(full)
        {name, dir?, if(dir?, do: 0, else: file_size(full))}
      end)
      |> Enum.sort_by(fn {name, dir?, _} -> {if(dir?, do: 0, else: 1), name} end)
      |> Enum.map(fn {name, dir?, size} ->
        ~s({"name":) <> jstr(name) <> ~s(,"dir":) <> to_string(dir?) <> ~s(,"size":) <> Integer.to_string(size) <> "}"
      end)
      |> Enum.join(",")

    ~s({"path":) <> jstr(rel) <> ~s(,"root":) <> jstr(root_abs) <> ~s(,"entries":[) <> entries <> "]}"
  end

  defp json(status, body, origin, req) do
    :cowboy_req.reply(
      status,
      cors(%{"content-type" => "application/json; charset=utf-8", "cache-control" => "no-store", "vary" => "origin"}, origin),
      body,
      req
    )
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
      |> String.replace("\n", "\\n")
      |> String.replace("\r", "\\r")
      |> String.replace("\t", "\\t"),
      ?"
    ])
  end

  defp jstr(v), do: jstr(to_string(v))
end
