
{:ok, _} = Application.ensure_all_started(:cowboy)

defmodule PtySocketExitTest do
  use ExUnit.Case, async: true

  @ospid 4242

  defp code_for(reason) do
    msg = {:DOWN, @ospid, :process, self(), reason}

    assert {:reply, frames, %{ospid: nil}} =
             PtySocket.websocket_info(msg, %{ospid: @ospid})

    assert [{:text, txt}, {:close, 1000, _}] = frames
    assert [_, n] = Regex.run(~r/"code":(-?\d+)/, txt)
    String.to_integer(n)
  end

  describe "exit_code/1 via the {:DOWN, ...} handler -- clean exits" do
    test ":normal -> 0" do
      assert code_for(:normal) == 0
    end

    test "{:exit_status, N} decodes the wait-status exit code" do
      assert code_for({:exit_status, 0}) == 0
      assert code_for({:exit_status, 256}) == 1
      assert code_for({:exit_status, 2560}) == 10
    end
  end

  describe "exit_code/1 + sig_to_int/1 -- signal deaths (regression for the atom path)" do
    test "SIGKILL (9) -> 137, not 143" do
      assert code_for({:exit_status, 9}) == 137
    end

    test "SIGINT (2) -> 130" do
      assert code_for({:exit_status, 2}) == 130
    end

    test "SIGSEGV (11) -> 139, with or without the core-dump bit" do
      assert code_for({:exit_status, 11}) == 139
      assert code_for({:exit_status, 139}) == 139
    end

    test "SIGTERM (15) -> 143" do
      assert code_for({:exit_status, 15}) == 143
    end

    test "a signal death never crashes the DOWN handler" do
      for sig <- [2, 3, 6, 9, 11, 15], do: assert(is_integer(code_for({:exit_status, sig})))
    end
  end

  describe "exit_code/1 -- anything else" do
    test ":noproc -> -1" do
      assert code_for(:noproc) == -1
    end

    test "an unrecognised reason -> -1" do
      assert code_for(:killed) == -1
      assert code_for({:shutdown, :whatever}) == -1
    end
  end

  describe "the DOWN clause itself" do
    test "clears ospid and asks cowboy to close" do
      assert {:reply, [{:text, _}, {:close, 1000, "pty exited"}], %{ospid: nil}} =
               PtySocket.websocket_info(
                 {:DOWN, @ospid, :process, self(), :normal},
                 %{ospid: @ospid}
               )
    end

    test "a {:DOWN, ...} for some other pid is ignored (ospid mismatch)" do
      assert {:ok, %{ospid: @ospid}} =
               PtySocket.websocket_info(
                 {:DOWN, 999, :process, self(), :normal},
                 %{ospid: @ospid}
               )
    end
  end
end
