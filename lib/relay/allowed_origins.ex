defmodule AllowedOrigins do

  @default_origins [
    "http://127.0.0.1:4001",
    "http://localhost:4001",
    "http://127.0.0.1:4100",
    "http://localhost:4100"
  ]

  def list do
    case System.get_env("TEZCATL_ALLOWED_ORIGINS") do
      nil ->
        @default_origins

      raw ->
        case parse(raw) do
          [] -> @default_origins
          origins -> origins
        end
    end
  end

  defp parse(raw) do
    raw
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
  end

  def check(:undefined), do: :ok

  def check(origin) when is_binary(origin) do
    if origin in list(), do: :ok, else: {:error, origin}
  end

  def check(other), do: {:error, other}

  def acao(origin) do
    case check(origin) do
      :ok when is_binary(origin) -> origin
      _ -> nil
    end
  end
end
