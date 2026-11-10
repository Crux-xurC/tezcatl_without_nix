defmodule PtyValidate do

  @max_dim 65_535

  def max_dim, do: @max_dim

  # path: a PATH string to look on (the project's, D-project-env); nil is the relay's own
  def validate_cmd(cmd, path \\ nil)

  def validate_cmd(cmd, path) when is_list(cmd) and cmd != [] do
    if Enum.all?(cmd, &is_binary/1) do
      [exe | args] = cmd

      found =
        if is_binary(path),
          do: ProjectEnvConfig.find_executable(exe, path),
          else: System.find_executable(exe)

      case found do
        nil -> {:error, "cmd not found on PATH: #{inspect(exe)}"}
        full -> {:ok, [String.to_charlist(full) | Enum.map(args, &String.to_charlist/1)]}
      end
    else
      {:error, "cmd elements must all be strings"}
    end
  end

  def validate_cmd(_, _), do: {:error, "cmd must be a non-empty array of strings"}

  def validate_size(rows, cols) do
    if dim?(rows) and dim?(cols),
      do: {:ok, rows, cols},
      else: {:error, "rows/cols must be integers in 1..#{@max_dim}"}
  end

  defp dim?(n), do: is_integer(n) and n > 0 and n <= @max_dim

  def validate_cwd(nil), do: {:ok, []}

  def validate_cwd(cwd) when is_binary(cwd) do
    if File.dir?(cwd),
      do: {:ok, [{:cd, String.to_charlist(cwd)}]},
      else: {:error, "cwd is not an existing directory: #{inspect(cwd)}"}
  end

  def validate_cwd(_), do: {:error, "cwd must be a string"}
end
