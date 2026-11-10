defmodule TezcatlRelay.MixProject do
  use Mix.Project

  # The relay of tezcatl as a Mix project, for running without Nix.
  #
  # lib/relay/*.ex and test/relay/ come from tezcatl (the upstream, run with
  # Nix as `elixir main.exs`) through sync/sync.sh; only app/, test/relay*/
  # test_helper.exs and the files listed in sync/README.md are this
  # repository's own. The dependency versions follow upstream's
  # nix/relay-packages.nix.
  def project do
    [
      app: :tezcatl_relay,
      version: "0.1.0",
      elixir: "~> 1.18",
      elixirc_paths: ["lib/relay", "app"],
      # lib/ also holds the browser side's JavaScript; Mix compiles only *.ex
      test_paths: [System.get_env("TEZCATL_TEST_PATH", "test/relay")],
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      releases: [
        # erlexec only loaded: the relay starts it when it first runs a program
        # (ensure_all_started), after app/release_env.ex has cleaned the environment
        # the release gave the VM -- erlexec's port program keeps the one it starts with
        tezcatl_relay: [include_executables_for: [:unix], applications: [erlexec: :load]]
      ]
    ]
  end

  def application do
    # Under `mix test` the relay itself is not started (upstream's tests start
    # what they need, as they did as standalone scripts)
    [extra_applications: [:logger, :crypto, :inets]] ++
      if Mix.env() == :test, do: [], else: [mod: {TezcatlRelay.Application, []}]
  end

  defp deps do
    [
      {:cowboy, "== 2.12.0"},
      {:cowlib, "== 2.13.0", override: true},
      {:ranch, "== 2.1.0", override: true},
      {:gun, "== 2.1.0"},
      {:erlexec, "== 2.3.4", runtime: false},
      {:telemetry, "== 1.4.2", override: true},
      {:decimal, "== 3.1.1", override: true},
      {:db_connection, "== 2.10.2", override: true},
      {:myxql, "== 0.9.0"}
    ]
  end
end
