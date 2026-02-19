defmodule WiretextAsciiRenderer.Parser do
  @moduledoc """
  Minimal WireText parser focused on layout-oriented ASCII rendering.

  Supported constructs:
  - Section headers: `=name` with optional ratio `n/d`
  - Horizontal groups: `[` ... `]`
  - Indentation-based nesting (2 spaces per level)
  - Plain rows/content lines
  """

  @type ratio :: {pos_integer(), pos_integer()} | nil

  @type wt_node ::
          %{type: :root, children: [wt_node()]}
          | %{type: :group, children: [wt_node()]}
          | %{type: :section, name: String.t(), ratio: ratio(), children: [wt_node()]}
          | %{type: :row, text: String.t()}

  @spec parse_file(Path.t()) :: {:ok, wt_node()} | {:error, String.t()}
  def parse_file(path) do
    case File.read(path) do
      {:ok, contents} ->
        parse(contents)

      {:error, reason} ->
        {:error, "failed to read #{path}: #{:file.format_error(reason)}"}
    end
  end

  @spec parse(String.t()) :: {:ok, wt_node()} | {:error, String.t()}
  def parse(contents) do
    lines =
      contents
      |> String.split("\n")
      |> Enum.with_index(1)

    root = %{type: :root, children: []}

    stack = [%{node: root, indent: -1}]

    with {:ok, stack} <- parse_lines(lines, stack),
         {:ok, stack} <- close_remaining(stack),
         [%{node: parsed_root, indent: -1}] <- stack do
      {:ok, parsed_root}
    else
      {:error, _} = error -> error
      _ -> {:error, "unexpected parser state"}
    end
  end

  defp close_remaining([%{indent: -1}] = stack), do: {:ok, stack}

  defp close_remaining([top, parent | rest]) do
    parent = append_child(parent, top.node)
    close_remaining([parent | rest])
  end

  defp parse_lines([], stack), do: {:ok, stack}

  defp parse_lines([{raw_line, line_no} | rest], stack) do
    line = String.trim_trailing(raw_line)

    if String.trim(line) == "" do
      parse_lines(rest, stack)
    else
      indent = indent_level(line)
      trimmed = String.trim_leading(line)

      cond do
        trimmed == "]" ->
          case pop_group(stack) do
            {:ok, new_stack} -> parse_lines(rest, new_stack)
            {:error, reason} -> {:error, "line #{line_no}: #{reason}"}
          end

        trimmed == "[" ->
          case attach_with_indent(stack, indent, %{type: :group, children: []}) do
            {:ok, new_stack} -> parse_lines(rest, new_stack)
            {:error, reason} -> {:error, "line #{line_no}: #{reason}"}
          end

        String.starts_with?(trimmed, "=") ->
          section = parse_section(trimmed)

          case attach_with_indent(stack, indent, section) do
            {:ok, new_stack} -> parse_lines(rest, new_stack)
            {:error, reason} -> {:error, "line #{line_no}: #{reason}"}
          end

        true ->
          row = %{type: :row, text: trimmed}

          case attach_leaf_with_indent(stack, indent, row) do
            {:ok, new_stack} -> parse_lines(rest, new_stack)
            {:error, reason} -> {:error, "line #{line_no}: #{reason}"}
          end
      end
    end
  end

  defp indent_level(line) do
    leading = String.length(line) - String.length(String.trim_leading(line))
    div(leading, 2)
  end

  defp parse_section("=" <> rest) do
    rest = String.trim(rest)

    case Regex.run(~r/^([^\s]+)(?:\s+(\d+)\/(\d+))?$/, rest) do
      [_, name, n, d] ->
        %{type: :section, name: name, ratio: {String.to_integer(n), String.to_integer(d)}, children: []}

      [_, name] ->
        %{type: :section, name: name, ratio: nil, children: []}

      _ ->
        %{type: :section, name: rest, ratio: nil, children: []}
    end
  end

  defp pop_group([top, parent | rest]) do
    case top.node do
      %{type: :group} = group ->
        parent = append_child(parent, group)
        {:ok, [parent | rest]}

      _ ->
        parent = append_child(parent, top.node)
        pop_group([parent | rest])
    end
  end

  defp pop_group([_]), do: {:error, "encountered ']' without matching '['"}

  defp attach_with_indent(stack, indent, node) do
    with {:ok, stack} <- reduce_stack_to_indent(stack, indent),
         {:ok, stack} <- push_child_container(stack, indent, node) do
      {:ok, stack}
    end
  end

  defp attach_leaf_with_indent(stack, indent, node) do
    with {:ok, stack} <- reduce_stack_to_indent(stack, indent),
         {:ok, stack} <- append_leaf(stack, node) do
      {:ok, stack}
    end
  end

  defp reduce_stack_to_indent([%{node: %{type: :group}, indent: group_indent} | _] = stack, indent)
       when indent >= group_indent do
    {:ok, stack}
  end

  defp reduce_stack_to_indent([%{indent: parent_indent} | _] = stack, indent)
       when indent > parent_indent do
    {:ok, stack}
  end

  defp reduce_stack_to_indent([top, parent | rest], indent) do
    parent = append_child(parent, top.node)
    reduce_stack_to_indent([parent | rest], indent)
  end

  defp reduce_stack_to_indent([_], _indent), do: {:error, "invalid indentation"}

  defp push_child_container([parent | rest], indent, node) do
    if has_children?(parent.node) do
      {:ok, [%{node: node, indent: indent}, parent | rest]}
    else
      {:error, "cannot nest under row content"}
    end
  end

  defp append_leaf([parent | rest], node) do
    if has_children?(parent.node) do
      {:ok, [append_child(parent, node) | rest]}
    else
      {:error, "cannot append row under row content"}
    end
  end

  defp has_children?(%{type: type}) when type in [:root, :group, :section], do: true
  defp has_children?(_), do: false

  defp append_child(%{node: node, indent: indent}, child) do
    %{node: %{node | children: node.children ++ [child]}, indent: indent}
  end
end
