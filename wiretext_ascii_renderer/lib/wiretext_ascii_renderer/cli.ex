defmodule WiretextAsciiRenderer.CLI do
  @moduledoc false

  alias WiretextAsciiRenderer.{Parser, Renderer}

  @default_width 140

  def main(args) do
    case parse_args(args) do
      {:ok, path, width} ->
        run(path, width)

      {:help, message} ->
        IO.puts(message)

      {:error, message} ->
        IO.puts(:stderr, message)
        IO.puts(:stderr, usage())
        System.halt(1)
    end
  end

  defp run(path, width) do
    case Parser.parse_file(path) do
      {:ok, ast} ->
        ast
        |> Renderer.render(width: width)
        |> IO.puts()

      {:error, reason} ->
        IO.puts(:stderr, reason)
        System.halt(1)
    end
  end

  defp parse_args(["-h"]), do: {:help, usage()}
  defp parse_args(["--help"]), do: {:help, usage()}

  defp parse_args([path]), do: {:ok, path, @default_width}

  defp parse_args([path, "--width", width_str]) do
    case Integer.parse(width_str) do
      {width, ""} when width >= 40 -> {:ok, path, width}
      _ -> {:error, "invalid width: #{width_str} (expected integer >= 40)"}
    end
  end

  defp parse_args(_), do: {:error, "invalid arguments"}

  defp usage do
    """
    Usage:
      wiretext_ascii_renderer <wiretext_file> [--width <cols>]

    Examples:
      wiretext_ascii_renderer /Users/jef/misc/codex-chat-layout-v2.wiretext
      wiretext_ascii_renderer /Users/jef/misc/codex-chat-layout-v2.wiretext --width 180
    """
    |> String.trim_trailing()
  end
end
