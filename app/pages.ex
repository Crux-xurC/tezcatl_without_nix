defmodule TezcatlRelay.Pages do
  # The static pages (main.html, panels/, lib/ ...), served by cowboy in the
  # relay's own VM. Upstream serves them with `python3 -m http.server` on :4001
  # (nix/t); here the relay starts a second listener instead, so running
  # tezcatl needs no Python. This repository's own (not from upstream).
  #
  #   TEZCATL_PAGES_PORT  the port (4001); "off" serves no pages
  #   TEZCATL_PAGES_DIR   the directory served (the current directory)
  #
  # Unlike http.server it gives no directory listings, and the Host gate
  # (AllowedHosts, D-loopback) runs ahead of it as it does for the relay, so a
  # page on a rebound name cannot read the files.
  @moduledoc false

  @doc "Starts the listener, or does nothing when the port is \"off\". :ok | {:error, reason}"
  def start do
    case System.get_env("TEZCATL_PAGES_PORT") || "4001" do
      "off" -> :ok
      port -> listen(String.to_integer(port), pages_dir())
    end
  end

  def port, do: System.get_env("TEZCATL_PAGES_PORT") || "4001"

  def pages_dir, do: Path.expand(System.get_env("TEZCATL_PAGES_DIR") || File.cwd!())

  defp listen(port, dir) do
    static = [{:mimetypes, __MODULE__, :mimetype}]

    dispatch =
      :cowboy_router.compile([
        {:_,
         [
           {"/", :cowboy_static, {:file, Path.join(dir, "main.html"), static}},
           {"/[...]", :cowboy_static, {:dir, dir, static}}
         ]}
      ])

    case :cowboy.start_clear(
           :tezcatl_pages,
           %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, port}]},
           %{env: %{dispatch: dispatch}, middlewares: [AllowedHosts, :cowboy_router, :cowboy_handler]}
         ) do
      {:ok, _} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  # cowboy's table, with what it lacks or names otherwise (module scripts must come
  # as JavaScript). No charset parameter, as with http.server: cowboy would then
  # match it against Accept and answer 406; the pages say UTF-8 themselves
  @doc false
  def mimetype(path) do
    case Path.extname(path) do
      ".mjs" -> {"text", "javascript", []}
      ".js" -> {"text", "javascript", []}
      ".html" -> {"text", "html", []}
      ".css" -> {"text", "css", []}
      ".json" -> {"application", "json", []}
      ".md" -> {"text", "markdown", []}
      ".woff2" -> {"font", "woff2", []}
      ".otf" -> {"font", "otf", []}
      ".ttf" -> {"font", "ttf", []}
      _ -> :cow_mimetypes.all(path)
    end
  end
end
