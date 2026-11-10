defmodule TezcatlRelay.ReleaseEnv do
  # This repository's own. Run from a release, the VM's environment holds what
  # the release's start script exported (RELEASE_*, and BINDIR, ROOTDIR, EMU,
  # PROGNAME pointing into the release, and the release's erts/bin first on
  # PATH). Every program started from here --
  # a terminal's shell, a language server, a project's REPL -- would inherit
  # them, and an `erl` / `iex` among them would then boot the release's files
  # instead of its own. So they are removed, once, when the application starts.
  # Run with mix (no RELEASE_ROOT), nothing is changed.
  @moduledoc false

  def scrub do
    if root = System.get_env("RELEASE_ROOT") do
      path =
        (System.get_env("PATH") || "")
        |> String.split(":")
        |> Enum.reject(&String.starts_with?(&1, root))
        |> Enum.join(":")

      System.put_env("PATH", path)

      for {k, _} <- System.get_env(),
          String.starts_with?(k, "RELEASE_") or k in ~w(BINDIR ROOTDIR EMU PROGNAME),
          do: System.delete_env(k)
    end

    :ok
  end
end
