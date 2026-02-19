defmodule WiretextAsciiRenderer do
  @moduledoc """
  Public API for parsing WireText and rendering an ASCII layout.
  """

  alias WiretextAsciiRenderer.{Parser, Renderer}

  @spec render_file(Path.t(), keyword()) :: {:ok, String.t()} | {:error, String.t()}
  def render_file(path, opts \\ []) do
    with {:ok, ast} <- Parser.parse_file(path) do
      {:ok, Renderer.render(ast, opts)}
    end
  end
end
