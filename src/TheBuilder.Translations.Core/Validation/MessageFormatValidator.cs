using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.Core.Validation;

public sealed class MessageFormatValidator : IMessageFormatValidator
{
    public MessageValidationResult Validate(string message, MessageFormat format)
    {
        if (format is MessageFormat.PlainText)
            return MessageValidationResult.Valid();
        if (format is MessageFormat.I18NextV4)
            return I18NextMessageValidator.Validate(message);

        try
        {
            var parser = new IcuScanner(message);
            return MessageValidationResult.Valid(parser.Scan());
        }
        catch (FormatException exception)
        {
            return MessageValidationResult.Invalid(exception.Message);
        }
    }

    private static class I18NextMessageValidator
    {
        public static MessageValidationResult Validate(string message)
        {
            var arguments = new Dictionary<string, string>(StringComparer.Ordinal);
            var position = 0;
            while (position < message.Length)
            {
                var opening = message.IndexOf("{{", position, StringComparison.Ordinal);
                var strayClosing = message.IndexOf("}}", position, StringComparison.Ordinal);
                if (strayClosing >= 0 && (opening < 0 || strayClosing < opening))
                    return MessageValidationResult.Invalid($"Unexpected closing interpolation delimiter at position {strayClosing}.");
                if (opening < 0)
                    return MessageValidationResult.Valid(arguments);

                var closing = message.IndexOf("}}", opening + 2, StringComparison.Ordinal);
                if (closing < 0)
                    return MessageValidationResult.Invalid($"Unclosed interpolation at position {opening}.");

                var expression = message[(opening + 2)..closing].Trim();
                if (expression.StartsWith("-", StringComparison.Ordinal))
                    expression = expression[1..].TrimStart();
                var separator = expression.IndexOf(',');
                var name = (separator < 0 ? expression : expression[..separator]).Trim();
                if (name.Length == 0 || name.Contains('{', StringComparison.Ordinal) || name.Contains('}', StringComparison.Ordinal))
                    return MessageValidationResult.Invalid($"Interpolation at position {opening} requires a variable name.");

                arguments[name] = "string";
                position = closing + 2;
            }

            return MessageValidationResult.Valid(arguments);
        }
    }

    private sealed class IcuScanner(string input)
    {
        private readonly Dictionary<string, string> _arguments = new(StringComparer.Ordinal);
        private int _position;

        public IReadOnlyDictionary<string, string> Scan()
        {
            ScanMessage(null);
            if (_position != input.Length)
                throw Error("Unexpected trailing content");
            return _arguments;
        }

        private void ScanMessage(char? terminator)
        {
            while (_position < input.Length)
            {
                var current = input[_position];
                if (current == '\'')
                {
                    ScanQuotedText();
                    continue;
                }

                if (current == '{')
                {
                    ScanArgument();
                    continue;
                }

                if (current == '}')
                {
                    if (terminator is null)
                        throw Error("Unmatched closing brace");
                    return;
                }

                _position++;
            }

            if (terminator is not null)
                throw Error("Unclosed argument branch");
        }

        // ICU only starts a quoted section when the apostrophe is followed by a syntax
        // character; '' is an escaped literal apostrophe, and every other apostrophe is
        // ordinary prose ("Il n'y a {count} messages", "Aujourd'hui").
        private void ScanQuotedText()
        {
            _position++;
            if (_position == input.Length)
                return;

            if (input[_position] == '\'')
            {
                _position++;
                return;
            }

            if (input[_position] is not ('{' or '}' or '#'))
                return;

            while (_position < input.Length)
            {
                if (input[_position] != '\'')
                {
                    _position++;
                    continue;
                }

                _position++;
                if (_position < input.Length && input[_position] == '\'')
                {
                    _position++;
                    continue;
                }
                return;
            }
        }

        private void ScanArgument()
        {
            _position++;
            SkipWhitespace();
            var name = ReadToken(',', '}');
            if (name.Length == 0)
                throw Error("Argument name is required");

            SkipWhitespace();
            if (Consume('}'))
            {
                AddArgument(name, "string");
                return;
            }

            Expect(',');
            SkipWhitespace();
            var kind = ReadToken(',', '}').ToLowerInvariant();
            if (kind is not ("number" or "date" or "time" or "plural" or "selectordinal" or "select"))
                throw Error($"Unsupported argument kind '{kind}'");
            AddArgument(name, kind);

            SkipWhitespace();
            if (Consume('}'))
                return;

            Expect(',');
            if (kind is "plural" or "selectordinal" or "select")
                ScanBranches(kind);
            else
                ScanStyle();
        }

        private void ScanBranches(string kind)
        {
            var hasOther = false;
            while (true)
            {
                SkipWhitespace();
                if (Consume('}'))
                    break;
                if (input.AsSpan(_position).StartsWith("offset:"))
                {
                    _position += "offset:".Length;
                    _ = ReadToken(' ', '\t', '\r', '\n', '}');
                    continue;
                }

                var selector = ReadToken('{');
                if (selector.Length == 0)
                    throw Error("A plural or select branch requires a selector");
                hasOther |= selector == "other";
                SkipWhitespace();
                Expect('{');
                ScanMessage('}');
                Expect('}');
            }

            if (!hasOther)
                throw Error($"The {kind} argument requires an 'other' branch");
        }

        private void ScanStyle()
        {
            while (_position < input.Length && input[_position] != '}')
                _position++;
            Expect('}');
        }

        private void AddArgument(string name, string kind)
        {
            if (_arguments.TryGetValue(name, out var existing) && existing != kind)
            {
                if (IsCompatible(existing, kind))
                    return;
                throw Error($"Argument '{name}' is used as both '{existing}' and '{kind}'");
            }
            _arguments[name] = kind;
        }

        private static bool IsCompatible(string left, string right) =>
            IsNumeric(left) && IsNumeric(right) || IsTextual(left) && IsTextual(right);

        private static bool IsNumeric(string kind) => kind is "number" or "plural" or "selectordinal";
        private static bool IsTextual(string kind) => kind is "string" or "select";

        private string ReadToken(params char[] terminators)
        {
            var start = _position;
            while (_position < input.Length && !terminators.Contains(input[_position]))
                _position++;
            return input[start.._position].Trim();
        }

        private void SkipWhitespace()
        {
            while (_position < input.Length && char.IsWhiteSpace(input[_position]))
                _position++;
        }

        private bool Consume(char expected)
        {
            if (_position >= input.Length || input[_position] != expected)
                return false;
            _position++;
            return true;
        }

        private void Expect(char expected)
        {
            if (!Consume(expected))
                throw Error($"Expected '{expected}'");
        }

        private FormatException Error(string message) => new($"{message} at position {_position}.");
    }
}
