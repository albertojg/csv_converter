var argv = require('minimist')(process.argv.slice(2)),
    fs = require('fs'),
    xml2js = require('xml2js'),
    csv = require('fast-csv');

var source = argv.f || argv.file;
var output = argv.o || argv.output;
if (!source || !output) {
  console.log('Missing source or output file!');
  process.exit(0);
}

switch (argv._[0]) {
  case 'jsonToCsv':
    convertJsonToCsv(source, output);
    break;

  case 'csvToJson':
    convertCsvToJson(source, output);
    break;

  case 'xmlToCsv':
    convertXmlToCsv(source, output);
    break;

  case 'csvToXml':
    convertCsvToXml(source, output);
    break;

  default:
    console.log('Unknown command type [jsonToCsv, csvToJson]');
}

function convertJsonToCsv(source, output) {
  console.log('Converting JSON source file: ' + source + " to CSV output file: " + output);

  var json = require(source);
  var flatJson = flattenJSONKey(json);
  writeToCsv(flatJson, output);
}

function convertCsvToJson(source, output) {
  console.log('Converting CSV source file: ' + source + " to JSON output file: " + output);
 
  function callback(data) {
    var unflatJson = unflattenJSONKey(data);
    var content = "module.exports = " + JSON.stringify(unflatJson, null, 4) + ";";

    fs.writeFileSync(output, content);
    console.log('Successfully write to JSON file: ' + output + '!');
  };

  readFromCsv(source, callback);  
}

function convertXmlToCsv(source, output) {
  console.log('Converting XML source file: ' + source + " to CSV output file: " + output);

  var parser = new xml2js.Parser({
    explicitArray: true,
    preserveChildrenOrder: true
  });
  fs.readFile(source, function(err, data) {
    parser.parseString(data, function(err, xml) {
      if (err) {
        console.log('Failed to parse XML input file: ' + source + '! Error: ' + err);
        process.exit(0);
      }

      if (!xml || !xml.resources || !xml.resources.string) {
        console.log('Empty resources element! Nothing to convert..');
        process.exit(0);
      }

      var object = {};
      xml.resources.string.forEach(function(item) {
        var key = item.$.name;
        var value = item._;
        object[key] = value;
      });
      writeToCsv(object, output);
    });
  });
}

function convertCsvToXml(source, output) {
  console.log('Converting CSV source file: ' + source + " to XML output file: " + output);

  function callback(data) {
    var builder = new xml2js.Builder({
      rootName: 'resources',
      // headless: true,
      cdata: true
    });

    var xml = {
      string: []
    };
    Object.keys(data).forEach(function(key) { 
      xml.string.push({
        "_": data[key],
        "$": {
          "name": key
        }
      });
    });

    fs.writeFileSync(output, builder.buildObject(xml));
    console.log('Successfully write to XML file: ' + output + '!');
  };

  readFromCsv(source, callback);
}

function readFromCsv(source, completeCallback) {
  var data = {};
  csv
    .fromPath(source, {
      headers: true
    })
    .on('data', function(row) {
      // data[row.key] = row.translated_value;
      data[row.key] = row.string_value;
    })
    .on('end', function() {
      if (completeCallback) {
        completeCallback(data);
      }
    })
    .on('error', function(err) {
      console.log('Failed to read input file! Error: ' + err);
    });
}

function writeToCsv(data, destination) {
  csv
    .writeToPath(destination, Object.keys(data), {
      headers: true,
      quoteColumns: true,
      transform: function(key) {
        return {
          'key': key,
          'string_value': data[key],
          'translated_value': '',
          'remarks': ''  
        };
      }
    })
    .on('finish', function(){
      console.log('Successfully write to ' + destination);
    })
    .on('error', function(err) {
      console.log('Failed to write output file! Error: ' + err);
    });
}

// ref: http://stackoverflow.com/questions/19098797/fastest-way-to-flatten-un-flatten-nested-json-objects
function flattenJSONKey(data) {
  var result = {};
  function recurse (cur, prop) {
    if (Object(cur) !== cur) {
      result[prop] = cur;
    } else if (Array.isArray(cur)) {
       for(var i=0, l=cur.length; i<l; i++)
         recurse(cur[i], prop + "[" + i + "]");
       if (l == 0)
         result[prop] = [];
    } else {
       var isEmpty = true;
       for (var p in cur) {
         isEmpty = false;
         recurse(cur[p], prop ? prop+"."+p : p);
       }
       if (isEmpty && prop)
         result[prop] = {};
    }
  }
  recurse(data, "");
  return result;
}

function unflattenJSONKey(data) {
  "use strict";
  if (Object(data) !== data || Array.isArray(data))
    return data;
  var regex = /\.?([^.\[\]]+)|\[(\d+)\]/g,
    resultholder = {};
  for (var p in data) {
    var cur = resultholder,
      prop = "",
      m;
    while (m = regex.exec(p)) {
      cur = cur[prop] || (cur[prop] = (m[2] ? [] : {}));
      prop = m[2] || m[1];
    }
    cur[prop] = data[p];
  }
  return resultholder[""] || resultholder;
}
