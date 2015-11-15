var argv = require('minimist')(process.argv.slice(2)),
    fs = require('fs'),
    xml2js = require('xml2js'),
    csv = require('fast-csv'),
    async = require('async');

var source = argv.f || argv.file;
var output = argv.o || argv.output;
if (!source || !output) {
  console.log('Missing source or output file!');
  process.exit(0);
}

var options = getAdditionalOptions();

switch (argv._[0]) {
  case 'jsonToCsv':
    convertJsonToCsv(source, output, options);
    break;

  case 'csvToJson':
    convertCsvToJson(source, output, options);
    break;

  case 'xmlToCsv':
    convertXmlToCsv(source, output, options);
    break;

  case 'csvToXml':
    convertCsvToXml(source, output, options);
    break;

  default:
    console.log('Unknown command type [jsonToCsv, csvToJson]');
}

function getAdditionalOptions() {
  return {
    translationSource: argv.t || argv.translation,
    csvFieldValue: argv.v
  };
}

function convertJsonToCsv(source, output, options) {
  options = options || {};

  var sourceJson = require(source);
  sourceJson = flattenJSONKey(sourceJson);

  var translationJson = {};
  if (options.translationSource) {
    translationJson = require(options.translationSource);
    translationJson = flattenJSONKey(translationJson);
  }

  var result = [];
  for (key in sourceJson) {
    result.push({
      key: key,
      string_value: sourceJson[key],
      translated_value: translationJson[key]
    });
  }

  writeToCsv(result, output);
}

function convertCsvToJson(source, output, options) {
  function callback(data) {
    var unflatJson = unflattenJSONKey(data);
    var content = "module.exports = " + JSON.stringify(unflatJson, null, 4) + ";";

    fs.writeFileSync(output, content);
    console.log('Successfully write to JSON file: ' + output + '!');
  };

  readFromCsv(source, callback, options);
}

function convertXmlToCsv(source, output, options) {
  options = options || {};

  var parser = new xml2js.Parser({
    explicitArray: true,
    preserveChildrenOrder: true
  });

  async.series({
    sourceXml: function(callback) {
      fs.readFile(source, function(err, data) {
        parser.parseString(data, callback);
      });
    },
    translationXml: function(callback) {
      if (options.translationSource) {
        fs.readFile(options.translationSource, function(err, data) {
          parser.parseString(data, callback);
        });
      } else {
        callback(null, null);
      }
    }
  }, function(err, result) {
    if (err) {
      console.log('Failed to read and parse XML input file! Error: ' + err);
      process.exit(0);
    }

    var sourceXml = result.sourceXml;
    var translationXml = result.translationXml;

    if (!sourceXml || !sourceXml.resources || !sourceXml.resources.string) {
      console.log('Empty source XML file!');
      process.exit(0);
    }

    var translationMap = {};
    if (translationXml && translationXml.resources && translationXml.resources.string) {
      translationXml.resources.string.forEach(function(item) {
        var key = item.$.name;
        var value = item._;
        translationMap[key] = value;
      });
    }

    var result = [];
    sourceXml.resources.string.forEach(function(item) {
      var key = item.$.name;
      result.push({
        key: key,
        string_value: item._,
        translated_value: translationMap[key]
      });
    });

    writeToCsv(result, output);
  });
}

function convertCsvToXml(source, output) {
  console.log('Converting CSV source file: ' + source + " to XML output file: " + output);

  function callback(data) {
    var builder = new xml2js.Builder({
      rootName: 'resources',
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

function readFromCsv(source, completeCallback, options) {
  options = options || {};
  var valueField = options.csvFieldValue || 'string_value';

  var data = {};
  csv
    .fromPath(source, {
      headers: true
    })
    .on('data', function(row) {
      data[row.key] = row[valueField];
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
          'key': data[key].key,
          'string_value': data[key].string_value,
          'translated_value': data[key].translated_value,
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
