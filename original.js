
// This is the original code that was used to create index.js
// It's not very well commented but you'll have to deal with it.
// Also, it's licensed under MIT so do whatever the heck you want with this.

/** LOAD INPUT FILE **/

/*
process.argv should look like:
0: node command
1: index.js path
2: <input file>
3: <output file>
*/

if (process.argv.length < 4) {
	console.error("Please specify both an input location and an output location, like this:\nnode index.js \"my file.js\" \"output.js\"");
	process.exit(1);
}

if (process.argv.length > 4) {
	console.warn("You specified too many arguments, so the remaining arguments are ignored. If you want to refer to a file with spaces in its path, please put quotes around the file path.");
}

const fs = require("fs");

//console.log("Reading file \"" + process.argv[2] + "\"...");

var input; 
try {
	input = fs.readFileSync(process.argv[2], "utf-8");
}
catch (error) {
	console.error("Failed to read the input file due to this error:\n" + error.message);
}

/** SPLIT TOKENS **/
// Each token is one operator, var name, keyword, string, etc. in the input file

console.log("Parsing input file...");

// What goes into which column. Note: in the # column, the code might put any other character it doesn't recognise as valid JS.
const firstColumns = ".;:,&|!?^+-*/%<>=#{}()[]";
const lastColumns = ["Keywords", "Numbers", "Strings", "Other primitives", "Variables"];

// This list also contains some deprecated keywords.
const keywords = ["abstract", "arguments", "await", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "debugger", "default", "delete", "do", "double", "each", "else", "enum", "eval", "export", "extends", "final", "finally", "float", "for", "function", "goto", "if", "implements", "import", "in", "instanceof", "int", "interface", "let", "long", "native", "new", "of", "package", "private", "protected", "public", "return", "short", "static", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "typeof", "var", "void", "volatile", "while", "with", "yield"];

const primitiveTypes = ["false", "Infinity", "NaN", "null", "true", "undefined"];

// The length of the longest string in this column.
var columnWidths = new Array(firstColumns.length + lastColumns.length).fill(0);

// Is used while looping through the input. True if JavaScript *generally* allows you to put things like numbers at this point in the program (for example, after an operator). This is useful to determine what the interpretation should be of the next token in the input (for example, should a forward slash be interpreted as an operator or as the start of a regular expression?).
var allowValuesHere = true;

// Each subarray is a row in the result, and each item in the row is either undefined or a string.
var rows = [[]];

// Adds one token to the rows
function addToken(column, content) {
    if (typeof column === "string") column = firstColumns.length + lastColumns.indexOf(column);

    // Prepare input for next iteration
	input = input.slice(content.length);

    // Sadly these operators are not allowed on a new line
    if ((content == "++" || content == "--") && rows[rows.length-1][firstColumns.length+lastColumns.length-1]) {
        rows[rows.length-1][firstColumns.length+lastColumns.length-1] += content;
        allowValuesHere = false;
    }

    else {
        // Add the content to the row
        let prevrow = rows[rows.length-1];
        if (column > prevrow.length-1) {
            // Check if there's something in front of an equal sign
            if (content[0] == '=') {
                content = prevrow[prevrow.length-1] + content;
                prevrow[prevrow.length-1] = undefined;
            }
            prevrow[column] = content;
        }
        else {
            let newRow = [];
            newRow[column] = content;
            rows.push(newRow);
        }

        columnWidths[column] = Math.max(columnWidths[column], content.length);
        allowValuesHere = column <= firstColumns.length && !".})]".includes(content[0]);
    }
}

// Loop until we've had enough
while (true) {
    
    // Search for next non-whitespace char
    let nextThing = input.search(/\S/);
    if (nextThing === -1) break;
    input = input.slice(nextThing);

	// Ignore comments; skip to next line
	if (input.startsWith("//")) {
        let nextLineIndex = input.indexOf("\n");
        if (nextLineIndex === -1) break;
		input = input.slice(nextLineIndex + 1);
		continue;
	}
	// Multiline comments
	if (input.startsWith("/*")) {
        let commentEndIndex = input.indexOf("*/");
        if (commentEndIndex == -1) break;
		input = input.slice(commentEndIndex + 2);
		continue;
	}

    // Numbers
    if (allowValuesHere) {
        let match = /^(-\s*)?(0x[0-9a-f]|[\d.]+(e-?\d+)?)/i.exec(input);
        if (match) {
            addToken("Numbers", match[0]);
            continue;
        }
    }

	// Strings & regex (TODO)
	if (input[0] === '"' || input[0] === '\'' || input[0] === '`' || input[0] === '/' && allowValuesHere) {
		// Search for unescaped closing char
		for (let i = 1; true; i++) {
			if (i === input.length || input[i] === input[0] && (input[i-1] !== '\\' || input[i-2] === '\\')) {
                i++;
                // Flags for regex
                if (input[0] === '/') i += input.slice(i).search(/\W/);

				addToken("Strings", input.slice(0, i));
				break;
			}
		}
		continue;
    }

    // => can't be split otherwise js will complain
    if (input.startsWith("=>")) {
        addToken(firstColumns.indexOf('='), "=>");
        continue;
    }

	// Simple columns (see above definitions)
	let column = firstColumns.indexOf(input[0]);
	if (column !== -1) {
        // Group identical operators
        for (var endIndex = 1; input[endIndex] == input[0]; endIndex++);
		addToken(column, input.slice(0, endIndex));
		continue;
	}

	// Words
	let match = /^\w+\b/.exec(input);
	if (match) {
		addToken(keywords.includes(match[0]) ? "Keywords" : primitiveTypes.includes(match[0]) ? "Other primitives" : "Variables", match[0]);
		continue;
	}
    
    // We don't recognise this character, so we'll put it in the # column.
    console.warn("I don't recognise the input here: " + input.slice(0, input.indexOf("\n")));
    addToken(firstColumns.indexOf('#'), input[0]);
}

// Check empty file
if (rows.length == 1 && rows[0].length == 0) {
    console.log("There is no actual code in this file!");
    process.exit();
}

console.log("Input file has been split into " + rows.length + " rows.");
//console.log(rows);

/** GENERATE THE OUTPUT **/

console.log("Generating output file...");

// Determine the widths of the columns
var numOperators = 0;
for (let i = 0; i < firstColumns.length-6; i++) {
    numOperators += columnWidths[i];
}
var operatorsColumnWidth = numOperators && Math.max(numOperators, "Operators".length);

var numBrackets = 0;
for (let i = firstColumns.length-6; i < firstColumns.length; i++) {
    numBrackets += columnWidths[i];
}
var bracketsColumnWidth = numBrackets && Math.max(numBrackets, "Brackets".length);

for (let i = firstColumns.length; i < columnWidths.length; i++) {
    if (columnWidths[i] !== 0) columnWidths[i] = Math.max(columnWidths[i], lastColumns[i-firstColumns.length].length);
}

// Create the lines above and below the header (array will be joined later)
let horline = [];
if (operatorsColumnWidth !== 0) horline.push('─'.repeat(operatorsColumnWidth + 4));
if (bracketsColumnWidth !== 0) horline.push('─'.repeat(bracketsColumnWidth + 4));
for (var column = firstColumns.length; column < columnWidths.length; column++) {
    if (columnWidths[column] == 0) continue;
    horline.push('─'.repeat(columnWidths[column] + 4));
}

// Create header
var result = "// ┌" + horline.join("┬") + "┐\n//";

if (operatorsColumnWidth !== 0) result += " │  Operators" + ' '.repeat(operatorsColumnWidth-8);
if (bracketsColumnWidth !== 0) result += " │  Brackets" + ' '.repeat(bracketsColumnWidth-7);
for (var column = 0; column < lastColumns.length; column++) {
    let columnW = columnWidths[column + firstColumns.length];
    if (columnW == 0) continue;
    result += " │  " + lastColumns[column] + ' '.repeat(columnW - lastColumns[column].length + 1);
}

result += " │\n// ├" + horline.join("┼") + "┤\n";

// Add rows to result
for (var row = 0; row < rows.length; row++) {
    result += " ";

    let separatorToAdd = 1;
    for (var column = 0; column < columnWidths.length; column++) {

        // Not the prettiest code but it's past midnight so whatever
        if (!separatorToAdd) {
            if (column === firstColumns.length-7) separatorToAdd = 2;
            else if (column === firstColumns.length) separatorToAdd = 3;
            else if (column > firstColumns.length) separatorToAdd = 4;
        }

        if (columnWidths[column] === 0) continue;

        if (separatorToAdd) {
            if (separatorToAdd == 2) result += ' '.repeat(operatorsColumnWidth - numOperators);
            else if (separatorToAdd == 3) result += ' '.repeat(bracketsColumnWidth - numBrackets);

            result += "/*│*/";
            separatorToAdd = 0;
        }

        // Add the actual text & more padding spaces
        let txt = rows[row][column] || "";
        result += txt + ' '.repeat(columnWidths[column] - txt.length);
    }
    result += "//│\n";
}

// Time to write!
try {
    fs.writeFileSync(process.argv[3], result);
}
catch (error) {
    console.error("Error while writing the output file:\n" + error.message);
}
console.log("Done!");
