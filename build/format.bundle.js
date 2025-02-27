/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 7083:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";
/*
 * EJS Embedded JavaScript templates
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/



/**
 * @file Embedded JavaScript templating engine. {@link http://ejs.co}
 * @author Matthew Eernisse <mde@fleegix.org>
 * @author Tiancheng "Timothy" Gu <timothygu99@gmail.com>
 * @project EJS
 * @license {@link http://www.apache.org/licenses/LICENSE-2.0 Apache License, Version 2.0}
 */

/**
 * EJS internal functions.
 *
 * Technically this "module" lies in the same file as {@link module:ejs}, for
 * the sake of organization all the private functions re grouped into this
 * module.
 *
 * @module ejs-internal
 * @private
 */

/**
 * Embedded JavaScript templating engine.
 *
 * @module ejs
 * @public
 */


var fs = __webpack_require__(7790);
var path = __webpack_require__(5272);
var utils = __webpack_require__(1176);

var scopeOptionWarned = false;
/** @type {string} */
var _VERSION_STRING = (__webpack_require__(3558)/* .version */ .i8);
var _DEFAULT_OPEN_DELIMITER = '<';
var _DEFAULT_CLOSE_DELIMITER = '>';
var _DEFAULT_DELIMITER = '%';
var _DEFAULT_LOCALS_NAME = 'locals';
var _NAME = 'ejs';
var _REGEX_STRING = '(<%%|%%>|<%=|<%-|<%_|<%#|<%|%>|-%>|_%>)';
var _OPTS_PASSABLE_WITH_DATA = ['delimiter', 'scope', 'context', 'debug', 'compileDebug',
  'client', '_with', 'rmWhitespace', 'strict', 'filename', 'async'];
// We don't allow 'cache' option to be passed in the data obj for
// the normal `render` call, but this is where Express 2 & 3 put it
// so we make an exception for `renderFile`
var _OPTS_PASSABLE_WITH_DATA_EXPRESS = _OPTS_PASSABLE_WITH_DATA.concat('cache');
var _BOM = /^\uFEFF/;
var _JS_IDENTIFIER = /^[a-zA-Z_$][0-9a-zA-Z_$]*$/;

/**
 * EJS template function cache. This can be a LRU object from lru-cache NPM
 * module. By default, it is {@link module:utils.cache}, a simple in-process
 * cache that grows continuously.
 *
 * @type {Cache}
 */

exports.cache = utils.cache;

/**
 * Custom file loader. Useful for template preprocessing or restricting access
 * to a certain part of the filesystem.
 *
 * @type {fileLoader}
 */

exports.fileLoader = fs.readFileSync;

/**
 * Name of the object containing the locals.
 *
 * This variable is overridden by {@link Options}`.localsName` if it is not
 * `undefined`.
 *
 * @type {String}
 * @public
 */

exports.localsName = _DEFAULT_LOCALS_NAME;

/**
 * Promise implementation -- defaults to the native implementation if available
 * This is mostly just for testability
 *
 * @type {PromiseConstructorLike}
 * @public
 */

exports.promiseImpl = (new Function('return this;'))().Promise;

/**
 * Get the path to the included file from the parent file path and the
 * specified path.
 *
 * @param {String}  name     specified path
 * @param {String}  filename parent file path
 * @param {Boolean} [isDir=false] whether the parent file path is a directory
 * @return {String}
 */
exports.resolveInclude = function(name, filename, isDir) {
  var dirname = path.dirname;
  var extname = path.extname;
  var resolve = path.resolve;
  var includePath = resolve(isDir ? filename : dirname(filename), name);
  var ext = extname(name);
  if (!ext) {
    includePath += '.ejs';
  }
  return includePath;
};

/**
 * Try to resolve file path on multiple directories
 *
 * @param  {String}        name  specified path
 * @param  {Array<String>} paths list of possible parent directory paths
 * @return {String}
 */
function resolvePaths(name, paths) {
  var filePath;
  if (paths.some(function (v) {
    filePath = exports.resolveInclude(name, v, true);
    return fs.existsSync(filePath);
  })) {
    return filePath;
  }
}

/**
 * Get the path to the included file by Options
 *
 * @param  {String}  path    specified path
 * @param  {Options} options compilation options
 * @return {String}
 */
function getIncludePath(path, options) {
  var includePath;
  var filePath;
  var views = options.views;
  var match = /^[A-Za-z]+:\\|^\//.exec(path);

  // Abs path
  if (match && match.length) {
    path = path.replace(/^\/*/, '');
    if (Array.isArray(options.root)) {
      includePath = resolvePaths(path, options.root);
    } else {
      includePath = exports.resolveInclude(path, options.root || '/', true);
    }
  }
  // Relative paths
  else {
    // Look relative to a passed filename first
    if (options.filename) {
      filePath = exports.resolveInclude(path, options.filename);
      if (fs.existsSync(filePath)) {
        includePath = filePath;
      }
    }
    // Then look in any views directories
    if (!includePath && Array.isArray(views)) {
      includePath = resolvePaths(path, views);
    }
    if (!includePath && typeof options.includer !== 'function') {
      throw new Error('Could not find the include file "' +
          options.escapeFunction(path) + '"');
    }
  }
  return includePath;
}

/**
 * Get the template from a string or a file, either compiled on-the-fly or
 * read from cache (if enabled), and cache the template if needed.
 *
 * If `template` is not set, the file specified in `options.filename` will be
 * read.
 *
 * If `options.cache` is true, this function reads the file from
 * `options.filename` so it must be set prior to calling this function.
 *
 * @memberof module:ejs-internal
 * @param {Options} options   compilation options
 * @param {String} [template] template source
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `options.client`, either type might be returned.
 * @static
 */

function handleCache(options, template) {
  var func;
  var filename = options.filename;
  var hasTemplate = arguments.length > 1;

  if (options.cache) {
    if (!filename) {
      throw new Error('cache option requires a filename');
    }
    func = exports.cache.get(filename);
    if (func) {
      return func;
    }
    if (!hasTemplate) {
      template = fileLoader(filename).toString().replace(_BOM, '');
    }
  }
  else if (!hasTemplate) {
    // istanbul ignore if: should not happen at all
    if (!filename) {
      throw new Error('Internal EJS error: no file name or template '
                    + 'provided');
    }
    template = fileLoader(filename).toString().replace(_BOM, '');
  }
  func = exports.compile(template, options);
  if (options.cache) {
    exports.cache.set(filename, func);
  }
  return func;
}

/**
 * Try calling handleCache with the given options and data and call the
 * callback with the result. If an error occurs, call the callback with
 * the error. Used by renderFile().
 *
 * @memberof module:ejs-internal
 * @param {Options} options    compilation options
 * @param {Object} data        template data
 * @param {RenderFileCallback} cb callback
 * @static
 */

function tryHandleCache(options, data, cb) {
  var result;
  if (!cb) {
    if (typeof exports.promiseImpl == 'function') {
      return new exports.promiseImpl(function (resolve, reject) {
        try {
          result = handleCache(options)(data);
          resolve(result);
        }
        catch (err) {
          reject(err);
        }
      });
    }
    else {
      throw new Error('Please provide a callback function');
    }
  }
  else {
    try {
      result = handleCache(options)(data);
    }
    catch (err) {
      return cb(err);
    }

    cb(null, result);
  }
}

/**
 * fileLoader is independent
 *
 * @param {String} filePath ejs file path.
 * @return {String} The contents of the specified file.
 * @static
 */

function fileLoader(filePath){
  return exports.fileLoader(filePath);
}

/**
 * Get the template function.
 *
 * If `options.cache` is `true`, then the template is cached.
 *
 * @memberof module:ejs-internal
 * @param {String}  path    path for the specified file
 * @param {Options} options compilation options
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `options.client`, either type might be returned
 * @static
 */

function includeFile(path, options) {
  var opts = utils.shallowCopy(utils.createNullProtoObjWherePossible(), options);
  opts.filename = getIncludePath(path, opts);
  if (typeof options.includer === 'function') {
    var includerResult = options.includer(path, opts.filename);
    if (includerResult) {
      if (includerResult.filename) {
        opts.filename = includerResult.filename;
      }
      if (includerResult.template) {
        return handleCache(opts, includerResult.template);
      }
    }
  }
  return handleCache(opts);
}

/**
 * Re-throw the given `err` in context to the `str` of ejs, `filename`, and
 * `lineno`.
 *
 * @implements {RethrowCallback}
 * @memberof module:ejs-internal
 * @param {Error}  err      Error object
 * @param {String} str      EJS source
 * @param {String} flnm     file name of the EJS file
 * @param {Number} lineno   line number of the error
 * @param {EscapeCallback} esc
 * @static
 */

function rethrow(err, str, flnm, lineno, esc) {
  var lines = str.split('\n');
  var start = Math.max(lineno - 3, 0);
  var end = Math.min(lines.length, lineno + 3);
  var filename = esc(flnm);
  // Error context
  var context = lines.slice(start, end).map(function (line, i){
    var curr = i + start + 1;
    return (curr == lineno ? ' >> ' : '    ')
      + curr
      + '| '
      + line;
  }).join('\n');

  // Alter exception message
  err.path = filename;
  err.message = (filename || 'ejs') + ':'
    + lineno + '\n'
    + context + '\n\n'
    + err.message;

  throw err;
}

function stripSemi(str){
  return str.replace(/;(\s*$)/, '$1');
}

/**
 * Compile the given `str` of ejs into a template function.
 *
 * @param {String}  template EJS template
 *
 * @param {Options} [opts] compilation options
 *
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `opts.client`, either type might be returned.
 * Note that the return type of the function also depends on the value of `opts.async`.
 * @public
 */

exports.compile = function compile(template, opts) {
  var templ;

  // v1 compat
  // 'scope' is 'context'
  // FIXME: Remove this in a future version
  if (opts && opts.scope) {
    if (!scopeOptionWarned){
      console.warn('`scope` option is deprecated and will be removed in EJS 3');
      scopeOptionWarned = true;
    }
    if (!opts.context) {
      opts.context = opts.scope;
    }
    delete opts.scope;
  }
  templ = new Template(template, opts);
  return templ.compile();
};

/**
 * Render the given `template` of ejs.
 *
 * If you would like to include options but not data, you need to explicitly
 * call this function with `data` being an empty object or `null`.
 *
 * @param {String}   template EJS template
 * @param {Object}  [data={}] template data
 * @param {Options} [opts={}] compilation and rendering options
 * @return {(String|Promise<String>)}
 * Return value type depends on `opts.async`.
 * @public
 */

exports.render = function (template, d, o) {
  var data = d || utils.createNullProtoObjWherePossible();
  var opts = o || utils.createNullProtoObjWherePossible();

  // No options object -- if there are optiony names
  // in the data, copy them to options
  if (arguments.length == 2) {
    utils.shallowCopyFromList(opts, data, _OPTS_PASSABLE_WITH_DATA);
  }

  return handleCache(opts, template)(data);
};

/**
 * Render an EJS file at the given `path` and callback `cb(err, str)`.
 *
 * If you would like to include options but not data, you need to explicitly
 * call this function with `data` being an empty object or `null`.
 *
 * @param {String}             path     path to the EJS file
 * @param {Object}            [data={}] template data
 * @param {Options}           [opts={}] compilation and rendering options
 * @param {RenderFileCallback} cb callback
 * @public
 */

exports.renderFile = function () {
  var args = Array.prototype.slice.call(arguments);
  var filename = args.shift();
  var cb;
  var opts = {filename: filename};
  var data;
  var viewOpts;

  // Do we have a callback?
  if (typeof arguments[arguments.length - 1] == 'function') {
    cb = args.pop();
  }
  // Do we have data/opts?
  if (args.length) {
    // Should always have data obj
    data = args.shift();
    // Normal passed opts (data obj + opts obj)
    if (args.length) {
      // Use shallowCopy so we don't pollute passed in opts obj with new vals
      utils.shallowCopy(opts, args.pop());
    }
    // Special casing for Express (settings + opts-in-data)
    else {
      // Express 3 and 4
      if (data.settings) {
        // Pull a few things from known locations
        if (data.settings.views) {
          opts.views = data.settings.views;
        }
        if (data.settings['view cache']) {
          opts.cache = true;
        }
        // Undocumented after Express 2, but still usable, esp. for
        // items that are unsafe to be passed along with data, like `root`
        viewOpts = data.settings['view options'];
        if (viewOpts) {
          utils.shallowCopy(opts, viewOpts);
        }
      }
      // Express 2 and lower, values set in app.locals, or people who just
      // want to pass options in their data. NOTE: These values will override
      // anything previously set in settings  or settings['view options']
      utils.shallowCopyFromList(opts, data, _OPTS_PASSABLE_WITH_DATA_EXPRESS);
    }
    opts.filename = filename;
  }
  else {
    data = utils.createNullProtoObjWherePossible();
  }

  return tryHandleCache(opts, data, cb);
};

/**
 * Clear intermediate JavaScript cache. Calls {@link Cache#reset}.
 * @public
 */

/**
 * EJS template class
 * @public
 */
exports.Template = Template;

exports.clearCache = function () {
  exports.cache.reset();
};

function Template(text, opts) {
  opts = opts || utils.createNullProtoObjWherePossible();
  var options = utils.createNullProtoObjWherePossible();
  this.templateText = text;
  /** @type {string | null} */
  this.mode = null;
  this.truncate = false;
  this.currentLine = 1;
  this.source = '';
  options.client = opts.client || false;
  options.escapeFunction = opts.escape || opts.escapeFunction || utils.escapeXML;
  options.compileDebug = opts.compileDebug !== false;
  options.debug = !!opts.debug;
  options.filename = opts.filename;
  options.openDelimiter = opts.openDelimiter || exports.openDelimiter || _DEFAULT_OPEN_DELIMITER;
  options.closeDelimiter = opts.closeDelimiter || exports.closeDelimiter || _DEFAULT_CLOSE_DELIMITER;
  options.delimiter = opts.delimiter || exports.delimiter || _DEFAULT_DELIMITER;
  options.strict = opts.strict || false;
  options.context = opts.context;
  options.cache = opts.cache || false;
  options.rmWhitespace = opts.rmWhitespace;
  options.root = opts.root;
  options.includer = opts.includer;
  options.outputFunctionName = opts.outputFunctionName;
  options.localsName = opts.localsName || exports.localsName || _DEFAULT_LOCALS_NAME;
  options.views = opts.views;
  options.async = opts.async;
  options.destructuredLocals = opts.destructuredLocals;
  options.legacyInclude = typeof opts.legacyInclude != 'undefined' ? !!opts.legacyInclude : true;

  if (options.strict) {
    options._with = false;
  }
  else {
    options._with = typeof opts._with != 'undefined' ? opts._with : true;
  }

  this.opts = options;

  this.regex = this.createRegex();
}

Template.modes = {
  EVAL: 'eval',
  ESCAPED: 'escaped',
  RAW: 'raw',
  COMMENT: 'comment',
  LITERAL: 'literal'
};

Template.prototype = {
  createRegex: function () {
    var str = _REGEX_STRING;
    var delim = utils.escapeRegExpChars(this.opts.delimiter);
    var open = utils.escapeRegExpChars(this.opts.openDelimiter);
    var close = utils.escapeRegExpChars(this.opts.closeDelimiter);
    str = str.replace(/%/g, delim)
      .replace(/</g, open)
      .replace(/>/g, close);
    return new RegExp(str);
  },

  compile: function () {
    /** @type {string} */
    var src;
    /** @type {ClientFunction} */
    var fn;
    var opts = this.opts;
    var prepended = '';
    var appended = '';
    /** @type {EscapeCallback} */
    var escapeFn = opts.escapeFunction;
    /** @type {FunctionConstructor} */
    var ctor;
    /** @type {string} */
    var sanitizedFilename = opts.filename ? JSON.stringify(opts.filename) : 'undefined';

    if (!this.source) {
      this.generateSource();
      prepended +=
        '  var __output = "";\n' +
        '  function __append(s) { if (s !== undefined && s !== null) __output += s }\n';
      if (opts.outputFunctionName) {
        if (!_JS_IDENTIFIER.test(opts.outputFunctionName)) {
          throw new Error('outputFunctionName is not a valid JS identifier.');
        }
        prepended += '  var ' + opts.outputFunctionName + ' = __append;' + '\n';
      }
      if (opts.localsName && !_JS_IDENTIFIER.test(opts.localsName)) {
        throw new Error('localsName is not a valid JS identifier.');
      }
      if (opts.destructuredLocals && opts.destructuredLocals.length) {
        var destructuring = '  var __locals = (' + opts.localsName + ' || {}),\n';
        for (var i = 0; i < opts.destructuredLocals.length; i++) {
          var name = opts.destructuredLocals[i];
          if (!_JS_IDENTIFIER.test(name)) {
            throw new Error('destructuredLocals[' + i + '] is not a valid JS identifier.');
          }
          if (i > 0) {
            destructuring += ',\n  ';
          }
          destructuring += name + ' = __locals.' + name;
        }
        prepended += destructuring + ';\n';
      }
      if (opts._with !== false) {
        prepended +=  '  with (' + opts.localsName + ' || {}) {' + '\n';
        appended += '  }' + '\n';
      }
      appended += '  return __output;' + '\n';
      this.source = prepended + this.source + appended;
    }

    if (opts.compileDebug) {
      src = 'var __line = 1' + '\n'
        + '  , __lines = ' + JSON.stringify(this.templateText) + '\n'
        + '  , __filename = ' + sanitizedFilename + ';' + '\n'
        + 'try {' + '\n'
        + this.source
        + '} catch (e) {' + '\n'
        + '  rethrow(e, __lines, __filename, __line, escapeFn);' + '\n'
        + '}' + '\n';
    }
    else {
      src = this.source;
    }

    if (opts.client) {
      src = 'escapeFn = escapeFn || ' + escapeFn.toString() + ';' + '\n' + src;
      if (opts.compileDebug) {
        src = 'rethrow = rethrow || ' + rethrow.toString() + ';' + '\n' + src;
      }
    }

    if (opts.strict) {
      src = '"use strict";\n' + src;
    }
    if (opts.debug) {
      console.log(src);
    }
    if (opts.compileDebug && opts.filename) {
      src = src + '\n'
        + '//# sourceURL=' + sanitizedFilename + '\n';
    }

    try {
      if (opts.async) {
        // Have to use generated function for this, since in envs without support,
        // it breaks in parsing
        try {
          ctor = (new Function('return (async function(){}).constructor;'))();
        }
        catch(e) {
          if (e instanceof SyntaxError) {
            throw new Error('This environment does not support async/await');
          }
          else {
            throw e;
          }
        }
      }
      else {
        ctor = Function;
      }
      fn = new ctor(opts.localsName + ', escapeFn, include, rethrow', src);
    }
    catch(e) {
      // istanbul ignore else
      if (e instanceof SyntaxError) {
        if (opts.filename) {
          e.message += ' in ' + opts.filename;
        }
        e.message += ' while compiling ejs\n\n';
        e.message += 'If the above error is not helpful, you may want to try EJS-Lint:\n';
        e.message += 'https://github.com/RyanZim/EJS-Lint';
        if (!opts.async) {
          e.message += '\n';
          e.message += 'Or, if you meant to create an async function, pass `async: true` as an option.';
        }
      }
      throw e;
    }

    // Return a callable function which will execute the function
    // created by the source-code, with the passed data as locals
    // Adds a local `include` function which allows full recursive include
    var returnedFn = opts.client ? fn : function anonymous(data) {
      var include = function (path, includeData) {
        var d = utils.shallowCopy(utils.createNullProtoObjWherePossible(), data);
        if (includeData) {
          d = utils.shallowCopy(d, includeData);
        }
        return includeFile(path, opts)(d);
      };
      return fn.apply(opts.context,
        [data || utils.createNullProtoObjWherePossible(), escapeFn, include, rethrow]);
    };
    if (opts.filename && typeof Object.defineProperty === 'function') {
      var filename = opts.filename;
      var basename = path.basename(filename, path.extname(filename));
      try {
        Object.defineProperty(returnedFn, 'name', {
          value: basename,
          writable: false,
          enumerable: false,
          configurable: true
        });
      } catch (e) {/* ignore */}
    }
    return returnedFn;
  },

  generateSource: function () {
    var opts = this.opts;

    if (opts.rmWhitespace) {
      // Have to use two separate replace here as `^` and `$` operators don't
      // work well with `\r` and empty lines don't work well with the `m` flag.
      this.templateText =
        this.templateText.replace(/[\r\n]+/g, '\n').replace(/^\s+|\s+$/gm, '');
    }

    // Slurp spaces and tabs before <%_ and after _%>
    this.templateText =
      this.templateText.replace(/[ \t]*<%_/gm, '<%_').replace(/_%>[ \t]*/gm, '_%>');

    var self = this;
    var matches = this.parseTemplateText();
    var d = this.opts.delimiter;
    var o = this.opts.openDelimiter;
    var c = this.opts.closeDelimiter;

    if (matches && matches.length) {
      matches.forEach(function (line, index) {
        var closing;
        // If this is an opening tag, check for closing tags
        // FIXME: May end up with some false positives here
        // Better to store modes as k/v with openDelimiter + delimiter as key
        // Then this can simply check against the map
        if ( line.indexOf(o + d) === 0        // If it is a tag
          && line.indexOf(o + d + d) !== 0) { // and is not escaped
          closing = matches[index + 2];
          if (!(closing == d + c || closing == '-' + d + c || closing == '_' + d + c)) {
            throw new Error('Could not find matching close tag for "' + line + '".');
          }
        }
        self.scanLine(line);
      });
    }

  },

  parseTemplateText: function () {
    var str = this.templateText;
    var pat = this.regex;
    var result = pat.exec(str);
    var arr = [];
    var firstPos;

    while (result) {
      firstPos = result.index;

      if (firstPos !== 0) {
        arr.push(str.substring(0, firstPos));
        str = str.slice(firstPos);
      }

      arr.push(result[0]);
      str = str.slice(result[0].length);
      result = pat.exec(str);
    }

    if (str) {
      arr.push(str);
    }

    return arr;
  },

  _addOutput: function (line) {
    if (this.truncate) {
      // Only replace single leading linebreak in the line after
      // -%> tag -- this is the single, trailing linebreak
      // after the tag that the truncation mode replaces
      // Handle Win / Unix / old Mac linebreaks -- do the \r\n
      // combo first in the regex-or
      line = line.replace(/^(?:\r\n|\r|\n)/, '');
      this.truncate = false;
    }
    if (!line) {
      return line;
    }

    // Preserve literal slashes
    line = line.replace(/\\/g, '\\\\');

    // Convert linebreaks
    line = line.replace(/\n/g, '\\n');
    line = line.replace(/\r/g, '\\r');

    // Escape double-quotes
    // - this will be the delimiter during execution
    line = line.replace(/"/g, '\\"');
    this.source += '    ; __append("' + line + '")' + '\n';
  },

  scanLine: function (line) {
    var self = this;
    var d = this.opts.delimiter;
    var o = this.opts.openDelimiter;
    var c = this.opts.closeDelimiter;
    var newLineCount = 0;

    newLineCount = (line.split('\n').length - 1);

    switch (line) {
    case o + d:
    case o + d + '_':
      this.mode = Template.modes.EVAL;
      break;
    case o + d + '=':
      this.mode = Template.modes.ESCAPED;
      break;
    case o + d + '-':
      this.mode = Template.modes.RAW;
      break;
    case o + d + '#':
      this.mode = Template.modes.COMMENT;
      break;
    case o + d + d:
      this.mode = Template.modes.LITERAL;
      this.source += '    ; __append("' + line.replace(o + d + d, o + d) + '")' + '\n';
      break;
    case d + d + c:
      this.mode = Template.modes.LITERAL;
      this.source += '    ; __append("' + line.replace(d + d + c, d + c) + '")' + '\n';
      break;
    case d + c:
    case '-' + d + c:
    case '_' + d + c:
      if (this.mode == Template.modes.LITERAL) {
        this._addOutput(line);
      }

      this.mode = null;
      this.truncate = line.indexOf('-') === 0 || line.indexOf('_') === 0;
      break;
    default:
      // In script mode, depends on type of tag
      if (this.mode) {
        // If '//' is found without a line break, add a line break.
        switch (this.mode) {
        case Template.modes.EVAL:
        case Template.modes.ESCAPED:
        case Template.modes.RAW:
          if (line.lastIndexOf('//') > line.lastIndexOf('\n')) {
            line += '\n';
          }
        }
        switch (this.mode) {
        // Just executing code
        case Template.modes.EVAL:
          this.source += '    ; ' + line + '\n';
          break;
          // Exec, esc, and output
        case Template.modes.ESCAPED:
          this.source += '    ; __append(escapeFn(' + stripSemi(line) + '))' + '\n';
          break;
          // Exec and output
        case Template.modes.RAW:
          this.source += '    ; __append(' + stripSemi(line) + ')' + '\n';
          break;
        case Template.modes.COMMENT:
          // Do nothing
          break;
          // Literal <%% mode, append as raw output
        case Template.modes.LITERAL:
          this._addOutput(line);
          break;
        }
      }
      // In string mode, just add the output
      else {
        this._addOutput(line);
      }
    }

    if (self.opts.compileDebug && newLineCount) {
      this.currentLine += newLineCount;
      this.source += '    ; __line = ' + this.currentLine + '\n';
    }
  }
};

/**
 * Escape characters reserved in XML.
 *
 * This is simply an export of {@link module:utils.escapeXML}.
 *
 * If `markup` is `undefined` or `null`, the empty string is returned.
 *
 * @param {String} markup Input string
 * @return {String} Escaped string
 * @public
 * @func
 * */
exports.escapeXML = utils.escapeXML;

/**
 * Express.js support.
 *
 * This is an alias for {@link module:ejs.renderFile}, in order to support
 * Express.js out-of-the-box.
 *
 * @func
 */

exports.__express = exports.renderFile;

/**
 * Version of EJS.
 *
 * @readonly
 * @type {String}
 * @public
 */

exports.VERSION = _VERSION_STRING;

/**
 * Name for detection of EJS.
 *
 * @readonly
 * @type {String}
 * @public
 */

exports.name = _NAME;

/* istanbul ignore if */
if (typeof window != 'undefined') {
  window.ejs = exports;
}


/***/ }),

/***/ 1176:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
/*
 * EJS Embedded JavaScript templates
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

/**
 * Private utility functions
 * @module utils
 * @private
 */



var regExpChars = /[|\\{}()[\]^$+*?.]/g;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var hasOwn = function (obj, key) { return hasOwnProperty.apply(obj, [key]); };

/**
 * Escape characters reserved in regular expressions.
 *
 * If `string` is `undefined` or `null`, the empty string is returned.
 *
 * @param {String} string Input string
 * @return {String} Escaped string
 * @static
 * @private
 */
exports.escapeRegExpChars = function (string) {
  // istanbul ignore if
  if (!string) {
    return '';
  }
  return String(string).replace(regExpChars, '\\$&');
};

var _ENCODE_HTML_RULES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&#34;',
  "'": '&#39;'
};
var _MATCH_HTML = /[&<>'"]/g;

function encode_char(c) {
  return _ENCODE_HTML_RULES[c] || c;
}

/**
 * Stringified version of constants used by {@link module:utils.escapeXML}.
 *
 * It is used in the process of generating {@link ClientFunction}s.
 *
 * @readonly
 * @type {String}
 */

var escapeFuncStr =
  'var _ENCODE_HTML_RULES = {\n'
+ '      "&": "&amp;"\n'
+ '    , "<": "&lt;"\n'
+ '    , ">": "&gt;"\n'
+ '    , \'"\': "&#34;"\n'
+ '    , "\'": "&#39;"\n'
+ '    }\n'
+ '  , _MATCH_HTML = /[&<>\'"]/g;\n'
+ 'function encode_char(c) {\n'
+ '  return _ENCODE_HTML_RULES[c] || c;\n'
+ '};\n';

/**
 * Escape characters reserved in XML.
 *
 * If `markup` is `undefined` or `null`, the empty string is returned.
 *
 * @implements {EscapeCallback}
 * @param {String} markup Input string
 * @return {String} Escaped string
 * @static
 * @private
 */

exports.escapeXML = function (markup) {
  return markup == undefined
    ? ''
    : String(markup)
      .replace(_MATCH_HTML, encode_char);
};
exports.escapeXML.toString = function () {
  return Function.prototype.toString.call(this) + ';\n' + escapeFuncStr;
};

/**
 * Naive copy of properties from one object to another.
 * Does not recurse into non-scalar properties
 * Does not check to see if the property has a value before copying
 *
 * @param  {Object} to   Destination object
 * @param  {Object} from Source object
 * @return {Object}      Destination object
 * @static
 * @private
 */
exports.shallowCopy = function (to, from) {
  from = from || {};
  if ((to !== null) && (to !== undefined)) {
    for (var p in from) {
      if (!hasOwn(from, p)) {
        continue;
      }
      if (p === '__proto__' || p === 'constructor') {
        continue;
      }
      to[p] = from[p];
    }
  }
  return to;
};

/**
 * Naive copy of a list of key names, from one object to another.
 * Only copies property if it is actually defined
 * Does not recurse into non-scalar properties
 *
 * @param  {Object} to   Destination object
 * @param  {Object} from Source object
 * @param  {Array} list List of properties to copy
 * @return {Object}      Destination object
 * @static
 * @private
 */
exports.shallowCopyFromList = function (to, from, list) {
  list = list || [];
  from = from || {};
  if ((to !== null) && (to !== undefined)) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (typeof from[p] != 'undefined') {
        if (!hasOwn(from, p)) {
          continue;
        }
        if (p === '__proto__' || p === 'constructor') {
          continue;
        }
        to[p] = from[p];
      }
    }
  }
  return to;
};

/**
 * Simple in-process cache implementation. Does not implement limits of any
 * sort.
 *
 * @implements {Cache}
 * @static
 * @private
 */
exports.cache = {
  _data: {},
  set: function (key, val) {
    this._data[key] = val;
  },
  get: function (key) {
    return this._data[key];
  },
  remove: function (key) {
    delete this._data[key];
  },
  reset: function () {
    this._data = {};
  }
};

/**
 * Transforms hyphen case variable into camel case.
 *
 * @param {String} string Hyphen case string
 * @return {String} Camel case string
 * @static
 * @private
 */
exports.hyphenToCamel = function (str) {
  return str.replace(/-[a-z]/g, function (match) { return match[1].toUpperCase(); });
};

/**
 * Returns a null-prototype object in runtimes that support it
 *
 * @return {Object} Object, prototype will be set to null where possible
 * @static
 * @private
 */
exports.createNullProtoObjWherePossible = (function () {
  if (typeof Object.create == 'function') {
    return function () {
      return Object.create(null);
    };
  }
  if (!({__proto__: null} instanceof Object)) {
    return function () {
      return {__proto__: null};
    };
  }
  // Not possible, just pass through
  return function () {
    return {};
  };
})();




/***/ }),

/***/ 7187:
/***/ ((module) => {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.



var R = typeof Reflect === 'object' ? Reflect : null
var ReflectApply = R && typeof R.apply === 'function'
  ? R.apply
  : function ReflectApply(target, receiver, args) {
    return Function.prototype.apply.call(target, receiver, args);
  }

var ReflectOwnKeys
if (R && typeof R.ownKeys === 'function') {
  ReflectOwnKeys = R.ownKeys
} else if (Object.getOwnPropertySymbols) {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target)
      .concat(Object.getOwnPropertySymbols(target));
  };
} else {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target);
  };
}

function ProcessEmitWarning(warning) {
  if (console && console.warn) console.warn(warning);
}

var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
  return value !== value;
}

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;
module.exports.once = once;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

function checkListener(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
  }
}

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function() {
    return defaultMaxListeners;
  },
  set: function(arg) {
    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
    }
    defaultMaxListeners = arg;
  }
});

EventEmitter.init = function() {

  if (this._events === undefined ||
      this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
  }
  this._maxListeners = n;
  return this;
};

function _getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return _getMaxListeners(this);
};

EventEmitter.prototype.emit = function emit(type) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  var doError = (type === 'error');

  var events = this._events;
  if (events !== undefined)
    doError = (doError && events.error === undefined);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    var er;
    if (args.length > 0)
      er = args[0];
    if (er instanceof Error) {
      // Note: The comments on the `throw` lines are intentional, they show
      // up in Node's output if this results in an unhandled exception.
      throw er; // Unhandled 'error' event
    }
    // At least give some kind of context to the user
    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
    err.context = er;
    throw err; // Unhandled 'error' event
  }

  var handler = events[type];

  if (handler === undefined)
    return false;

  if (typeof handler === 'function') {
    ReflectApply(handler, this, args);
  } else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      ReflectApply(listeners[i], this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  checkListener(listener);

  events = target._events;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener !== undefined) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (existing === undefined) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
        prepend ? [listener, existing] : [existing, listener];
      // If we've already got an array, just append.
    } else if (prepend) {
      existing.unshift(listener);
    } else {
      existing.push(listener);
    }

    // Check for listener leak
    m = _getMaxListeners(target);
    if (m > 0 && existing.length > m && !existing.warned) {
      existing.warned = true;
      // No error code for this since it is a Warning
      // eslint-disable-next-line no-restricted-syntax
      var w = new Error('Possible EventEmitter memory leak detected. ' +
                          existing.length + ' ' + String(type) + ' listeners ' +
                          'added. Use emitter.setMaxListeners() to ' +
                          'increase limit');
      w.name = 'MaxListenersExceededWarning';
      w.emitter = target;
      w.type = type;
      w.count = existing.length;
      ProcessEmitWarning(w);
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    if (arguments.length === 0)
      return this.listener.call(this.target);
    return this.listener.apply(this.target, arguments);
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  checkListener(listener);
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      checkListener(listener);

      events = this._events;
      if (events === undefined)
        return this;

      list = events[type];
      if (list === undefined)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener !== undefined)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (events === undefined)
        return this;

      // not listening for removeListener, no need to emit
      if (events.removeListener === undefined) {
        if (arguments.length === 0) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== undefined) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = Object.create(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners !== undefined) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (events === undefined)
    return [];

  var evlistener = events[type];
  if (evlistener === undefined)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ?
    unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events !== undefined) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener !== undefined) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
};

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function spliceOne(list, index) {
  for (; index + 1 < list.length; index++)
    list[index] = list[index + 1];
  list.pop();
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function once(emitter, name) {
  return new Promise(function (resolve, reject) {
    function errorListener(err) {
      emitter.removeListener(name, resolver);
      reject(err);
    }

    function resolver() {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('error', errorListener);
      }
      resolve([].slice.call(arguments));
    };

    eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
    if (name !== 'error') {
      addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
    }
  });
}

function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
  if (typeof emitter.on === 'function') {
    eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
  }
}

function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
  if (typeof emitter.on === 'function') {
    if (flags.once) {
      emitter.once(name, listener);
    } else {
      emitter.on(name, listener);
    }
  } else if (typeof emitter.addEventListener === 'function') {
    // EventTarget does not have `error` event semantics like Node
    // EventEmitters, we do not listen for `error` events here.
    emitter.addEventListener(name, function wrapListener(arg) {
      // IE does not have builtin `{ once: true }` support so we
      // have to do it manually.
      if (flags.once) {
        emitter.removeEventListener(name, wrapListener);
      }
      listener(arg);
    });
  } else {
    throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
  }
}


/***/ }),

/***/ 9755:
/***/ (function(module, exports) {

var __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;/*!
 * jQuery JavaScript Library v3.6.0
 * https://jquery.com/
 *
 * Includes Sizzle.js
 * https://sizzlejs.com/
 *
 * Copyright OpenJS Foundation and other contributors
 * Released under the MIT license
 * https://jquery.org/license
 *
 * Date: 2021-03-02T17:08Z
 */
( function( global, factory ) {

	"use strict";

	if (  true && typeof module.exports === "object" ) {

		// For CommonJS and CommonJS-like environments where a proper `window`
		// is present, execute the factory and get jQuery.
		// For environments that do not have a `window` with a `document`
		// (such as Node.js), expose a factory as module.exports.
		// This accentuates the need for the creation of a real `window`.
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info.
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
} )( typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Edge <= 12 - 13+, Firefox <=18 - 45+, IE 10 - 11, Safari 5.1 - 9+, iOS 6 - 9.1
// throw exceptions when non-strict code (e.g., ASP.NET 4.5) accesses strict mode
// arguments.callee.caller (trac-13335). But as of jQuery 3.0 (2016), strict mode should be common
// enough that all such attempts are guarded in a try block.
"use strict";

var arr = [];

var getProto = Object.getPrototypeOf;

var slice = arr.slice;

var flat = arr.flat ? function( array ) {
	return arr.flat.call( array );
} : function( array ) {
	return arr.concat.apply( [], array );
};


var push = arr.push;

var indexOf = arr.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var fnToString = hasOwn.toString;

var ObjectFunctionString = fnToString.call( Object );

var support = {};

var isFunction = function isFunction( obj ) {

		// Support: Chrome <=57, Firefox <=52
		// In some browsers, typeof returns "function" for HTML <object> elements
		// (i.e., `typeof document.createElement( "object" ) === "function"`).
		// We don't want to classify *any* DOM node as a function.
		// Support: QtWeb <=3.8.5, WebKit <=534.34, wkhtmltopdf tool <=0.12.5
		// Plus for old WebKit, typeof returns "function" for HTML collections
		// (e.g., `typeof document.getElementsByTagName("div") === "function"`). (gh-4756)
		return typeof obj === "function" && typeof obj.nodeType !== "number" &&
			typeof obj.item !== "function";
	};


var isWindow = function isWindow( obj ) {
		return obj != null && obj === obj.window;
	};


var document = window.document;



	var preservedScriptAttributes = {
		type: true,
		src: true,
		nonce: true,
		noModule: true
	};

	function DOMEval( code, node, doc ) {
		doc = doc || document;

		var i, val,
			script = doc.createElement( "script" );

		script.text = code;
		if ( node ) {
			for ( i in preservedScriptAttributes ) {

				// Support: Firefox 64+, Edge 18+
				// Some browsers don't support the "nonce" property on scripts.
				// On the other hand, just using `getAttribute` is not enough as
				// the `nonce` attribute is reset to an empty string whenever it
				// becomes browsing-context connected.
				// See https://github.com/whatwg/html/issues/2369
				// See https://html.spec.whatwg.org/#nonce-attributes
				// The `node.getAttribute` check was added for the sake of
				// `jQuery.globalEval` so that it can fake a nonce-containing node
				// via an object.
				val = node[ i ] || node.getAttribute && node.getAttribute( i );
				if ( val ) {
					script.setAttribute( i, val );
				}
			}
		}
		doc.head.appendChild( script ).parentNode.removeChild( script );
	}


function toType( obj ) {
	if ( obj == null ) {
		return obj + "";
	}

	// Support: Android <=2.3 only (functionish RegExp)
	return typeof obj === "object" || typeof obj === "function" ?
		class2type[ toString.call( obj ) ] || "object" :
		typeof obj;
}
/* global Symbol */
// Defining this global in .eslintrc.json would create a danger of using the global
// unguarded in another place, it seems safer to define global only for this module



var
	version = "3.6.0",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {

		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	};

jQuery.fn = jQuery.prototype = {

	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {

		// Return all the elements in a clean array
		if ( num == null ) {
			return slice.call( this );
		}

		// Return just the one element from the set
		return num < 0 ? this[ num + this.length ] : this[ num ];
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	each: function( callback ) {
		return jQuery.each( this, callback );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map( this, function( elem, i ) {
			return callback.call( elem, i, elem );
		} ) );
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	even: function() {
		return this.pushStack( jQuery.grep( this, function( _elem, i ) {
			return ( i + 1 ) % 2;
		} ) );
	},

	odd: function() {
		return this.pushStack( jQuery.grep( this, function( _elem, i ) {
			return i % 2;
		} ) );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[ j ] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor();
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: arr.sort,
	splice: arr.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[ 0 ] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// Skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !isFunction( target ) ) {
		target = {};
	}

	// Extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {

		// Only deal with non-null/undefined values
		if ( ( options = arguments[ i ] ) != null ) {

			// Extend the base object
			for ( name in options ) {
				copy = options[ name ];

				// Prevent Object.prototype pollution
				// Prevent never-ending loop
				if ( name === "__proto__" || target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject( copy ) ||
					( copyIsArray = Array.isArray( copy ) ) ) ) {
					src = target[ name ];

					// Ensure proper type for the source value
					if ( copyIsArray && !Array.isArray( src ) ) {
						clone = [];
					} else if ( !copyIsArray && !jQuery.isPlainObject( src ) ) {
						clone = {};
					} else {
						clone = src;
					}
					copyIsArray = false;

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend( {

	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	isPlainObject: function( obj ) {
		var proto, Ctor;

		// Detect obvious negatives
		// Use toString instead of jQuery.type to catch host objects
		if ( !obj || toString.call( obj ) !== "[object Object]" ) {
			return false;
		}

		proto = getProto( obj );

		// Objects with no prototype (e.g., `Object.create( null )`) are plain
		if ( !proto ) {
			return true;
		}

		// Objects with prototype are plain iff they were constructed by a global Object function
		Ctor = hasOwn.call( proto, "constructor" ) && proto.constructor;
		return typeof Ctor === "function" && fnToString.call( Ctor ) === ObjectFunctionString;
	},

	isEmptyObject: function( obj ) {
		var name;

		for ( name in obj ) {
			return false;
		}
		return true;
	},

	// Evaluates a script in a provided context; falls back to the global one
	// if not specified.
	globalEval: function( code, options, doc ) {
		DOMEval( code, { nonce: options && options.nonce }, doc );
	},

	each: function( obj, callback ) {
		var length, i = 0;

		if ( isArrayLike( obj ) ) {
			length = obj.length;
			for ( ; i < length; i++ ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		} else {
			for ( i in obj ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		}

		return obj;
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArrayLike( Object( arr ) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
						[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : indexOf.call( arr, elem, i );
	},

	// Support: Android <=4.0 only, PhantomJS 1 only
	// push.apply(_, arraylike) throws on ancient WebKit
	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		for ( ; j < len; j++ ) {
			first[ i++ ] = second[ j ];
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var length, value,
			i = 0,
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArrayLike( elems ) ) {
			length = elems.length;
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return flat( ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
} );

if ( typeof Symbol === "function" ) {
	jQuery.fn[ Symbol.iterator ] = arr[ Symbol.iterator ];
}

// Populate the class2type map
jQuery.each( "Boolean Number String Function Array Date RegExp Object Error Symbol".split( " " ),
	function( _i, name ) {
		class2type[ "[object " + name + "]" ] = name.toLowerCase();
	} );

function isArrayLike( obj ) {

	// Support: real iOS 8.2 only (not reproducible in simulator)
	// `in` check used to prevent JIT error (gh-2145)
	// hasOwn isn't used here due to false negatives
	// regarding Nodelist length in IE
	var length = !!obj && "length" in obj && obj.length,
		type = toType( obj );

	if ( isFunction( obj ) || isWindow( obj ) ) {
		return false;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v2.3.6
 * https://sizzlejs.com/
 *
 * Copyright JS Foundation and other contributors
 * Released under the MIT license
 * https://js.foundation/
 *
 * Date: 2021-02-16
 */
( function( window ) {
var i,
	support,
	Expr,
	getText,
	isXML,
	tokenize,
	compile,
	select,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + 1 * new Date(),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	nonnativeSelectorCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// Instance methods
	hasOwn = ( {} ).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	pushNative = arr.push,
	push = arr.push,
	slice = arr.slice,

	// Use a stripped-down indexOf as it's faster than native
	// https://jsperf.com/thor-indexof-vs-for/5
	indexOf = function( list, elem ) {
		var i = 0,
			len = list.length;
		for ( ; i < len; i++ ) {
			if ( list[ i ] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|" +
		"ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",

	// https://www.w3.org/TR/css-syntax-3/#ident-token-diagram
	identifier = "(?:\\\\[\\da-fA-F]{1,6}" + whitespace +
		"?|\\\\[^\\r\\n\\f]|[\\w-]|[^\0-\\x7f])+",

	// Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + identifier + ")(?:" + whitespace +

		// Operator (capture 2)
		"*([*^$|!~]?=)" + whitespace +

		// "Attribute values must be CSS identifiers [capture 5]
		// or strings [capture 3 or capture 4]"
		"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" +
		whitespace + "*\\]",

	pseudos = ":(" + identifier + ")(?:\\((" +

		// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
		// 1. quoted (capture 3; capture 4 or capture 5)
		"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +

		// 2. simple (capture 6)
		"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +

		// 3. anything else (capture 2)
		".*" +
		")\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rwhitespace = new RegExp( whitespace + "+", "g" ),
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" +
		whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace +
		"*" ),
	rdescend = new RegExp( whitespace + "|>" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + identifier + ")" ),
		"CLASS": new RegExp( "^\\.(" + identifier + ")" ),
		"TAG": new RegExp( "^(" + identifier + "|[*])" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" +
			whitespace + "*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" +
			whitespace + "*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),

		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace +
			"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + whitespace +
			"*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rhtml = /HTML$/i,
	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,

	// CSS escapes
	// http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\[\\da-fA-F]{1,6}" + whitespace + "?|\\\\([^\\r\\n\\f])", "g" ),
	funescape = function( escape, nonHex ) {
		var high = "0x" + escape.slice( 1 ) - 0x10000;

		return nonHex ?

			// Strip the backslash prefix from a non-hex escape sequence
			nonHex :

			// Replace a hexadecimal escape sequence with the encoded Unicode code point
			// Support: IE <=11+
			// For values outside the Basic Multilingual Plane (BMP), manually construct a
			// surrogate pair
			high < 0 ?
				String.fromCharCode( high + 0x10000 ) :
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	},

	// CSS string/identifier serialization
	// https://drafts.csswg.org/cssom/#common-serializing-idioms
	rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,
	fcssescape = function( ch, asCodePoint ) {
		if ( asCodePoint ) {

			// U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
			if ( ch === "\0" ) {
				return "\uFFFD";
			}

			// Control characters and (dependent upon position) numbers get escaped as code points
			return ch.slice( 0, -1 ) + "\\" +
				ch.charCodeAt( ch.length - 1 ).toString( 16 ) + " ";
		}

		// Other potentially-special ASCII characters get backslash-escaped
		return "\\" + ch;
	},

	// Used for iframes
	// See setDocument()
	// Removing the function wrapper causes a "Permission Denied"
	// error in IE
	unloadHandler = function() {
		setDocument();
	},

	inDisabledFieldset = addCombinator(
		function( elem ) {
			return elem.disabled === true && elem.nodeName.toLowerCase() === "fieldset";
		},
		{ dir: "parentNode", next: "legend" }
	);

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		( arr = slice.call( preferredDoc.childNodes ) ),
		preferredDoc.childNodes
	);

	// Support: Android<4.0
	// Detect silently failing push.apply
	// eslint-disable-next-line no-unused-expressions
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			pushNative.apply( target, slice.call( els ) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;

			// Can't trust NodeList.length
			while ( ( target[ j++ ] = els[ i++ ] ) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var m, i, elem, nid, match, groups, newSelector,
		newContext = context && context.ownerDocument,

		// nodeType defaults to 9, since context defaults to document
		nodeType = context ? context.nodeType : 9;

	results = results || [];

	// Return early from calls with invalid selector or context
	if ( typeof selector !== "string" || !selector ||
		nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

		return results;
	}

	// Try to shortcut find operations (as opposed to filters) in HTML documents
	if ( !seed ) {
		setDocument( context );
		context = context || document;

		if ( documentIsHTML ) {

			// If the selector is sufficiently simple, try using a "get*By*" DOM method
			// (excepting DocumentFragment context, where the methods don't exist)
			if ( nodeType !== 11 && ( match = rquickExpr.exec( selector ) ) ) {

				// ID selector
				if ( ( m = match[ 1 ] ) ) {

					// Document context
					if ( nodeType === 9 ) {
						if ( ( elem = context.getElementById( m ) ) ) {

							// Support: IE, Opera, Webkit
							// TODO: identify versions
							// getElementById can match elements by name instead of ID
							if ( elem.id === m ) {
								results.push( elem );
								return results;
							}
						} else {
							return results;
						}

					// Element context
					} else {

						// Support: IE, Opera, Webkit
						// TODO: identify versions
						// getElementById can match elements by name instead of ID
						if ( newContext && ( elem = newContext.getElementById( m ) ) &&
							contains( context, elem ) &&
							elem.id === m ) {

							results.push( elem );
							return results;
						}
					}

				// Type selector
				} else if ( match[ 2 ] ) {
					push.apply( results, context.getElementsByTagName( selector ) );
					return results;

				// Class selector
				} else if ( ( m = match[ 3 ] ) && support.getElementsByClassName &&
					context.getElementsByClassName ) {

					push.apply( results, context.getElementsByClassName( m ) );
					return results;
				}
			}

			// Take advantage of querySelectorAll
			if ( support.qsa &&
				!nonnativeSelectorCache[ selector + " " ] &&
				( !rbuggyQSA || !rbuggyQSA.test( selector ) ) &&

				// Support: IE 8 only
				// Exclude object elements
				( nodeType !== 1 || context.nodeName.toLowerCase() !== "object" ) ) {

				newSelector = selector;
				newContext = context;

				// qSA considers elements outside a scoping root when evaluating child or
				// descendant combinators, which is not what we want.
				// In such cases, we work around the behavior by prefixing every selector in the
				// list with an ID selector referencing the scope context.
				// The technique has to be used as well when a leading combinator is used
				// as such selectors are not recognized by querySelectorAll.
				// Thanks to Andrew Dupont for this technique.
				if ( nodeType === 1 &&
					( rdescend.test( selector ) || rcombinators.test( selector ) ) ) {

					// Expand context for sibling selectors
					newContext = rsibling.test( selector ) && testContext( context.parentNode ) ||
						context;

					// We can use :scope instead of the ID hack if the browser
					// supports it & if we're not changing the context.
					if ( newContext !== context || !support.scope ) {

						// Capture the context ID, setting it first if necessary
						if ( ( nid = context.getAttribute( "id" ) ) ) {
							nid = nid.replace( rcssescape, fcssescape );
						} else {
							context.setAttribute( "id", ( nid = expando ) );
						}
					}

					// Prefix every selector in the list
					groups = tokenize( selector );
					i = groups.length;
					while ( i-- ) {
						groups[ i ] = ( nid ? "#" + nid : ":scope" ) + " " +
							toSelector( groups[ i ] );
					}
					newSelector = groups.join( "," );
				}

				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch ( qsaError ) {
					nonnativeSelectorCache( selector, true );
				} finally {
					if ( nid === expando ) {
						context.removeAttribute( "id" );
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {function(string, object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {

		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {

			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return ( cache[ key + " " ] = value );
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created element and returns a boolean result
 */
function assert( fn ) {
	var el = document.createElement( "fieldset" );

	try {
		return !!fn( el );
	} catch ( e ) {
		return false;
	} finally {

		// Remove from its parent by default
		if ( el.parentNode ) {
			el.parentNode.removeChild( el );
		}

		// release memory in IE
		el = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split( "|" ),
		i = arr.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[ i ] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			a.sourceIndex - b.sourceIndex;

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( ( cur = cur.nextSibling ) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return ( name === "input" || name === "button" ) && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for :enabled/:disabled
 * @param {Boolean} disabled true for :disabled; false for :enabled
 */
function createDisabledPseudo( disabled ) {

	// Known :disabled false positives: fieldset[disabled] > legend:nth-of-type(n+2) :can-disable
	return function( elem ) {

		// Only certain elements can match :enabled or :disabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-enabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-disabled
		if ( "form" in elem ) {

			// Check for inherited disabledness on relevant non-disabled elements:
			// * listed form-associated elements in a disabled fieldset
			//   https://html.spec.whatwg.org/multipage/forms.html#category-listed
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-fe-disabled
			// * option elements in a disabled optgroup
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-option-disabled
			// All such elements have a "form" property.
			if ( elem.parentNode && elem.disabled === false ) {

				// Option elements defer to a parent optgroup if present
				if ( "label" in elem ) {
					if ( "label" in elem.parentNode ) {
						return elem.parentNode.disabled === disabled;
					} else {
						return elem.disabled === disabled;
					}
				}

				// Support: IE 6 - 11
				// Use the isDisabled shortcut property to check for disabled fieldset ancestors
				return elem.isDisabled === disabled ||

					// Where there is no isDisabled, check manually
					/* jshint -W018 */
					elem.isDisabled !== !disabled &&
					inDisabledFieldset( elem ) === disabled;
			}

			return elem.disabled === disabled;

		// Try to winnow out elements that can't be disabled before trusting the disabled property.
		// Some victims get caught in our net (label, legend, menu, track), but it shouldn't
		// even exist on them, let alone have a boolean value.
		} else if ( "label" in elem ) {
			return elem.disabled === disabled;
		}

		// Remaining elements are neither :enabled nor :disabled
		return false;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction( function( argument ) {
		argument = +argument;
		return markFunction( function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ ( j = matchIndexes[ i ] ) ] ) {
					seed[ j ] = !( matches[ j ] = seed[ j ] );
				}
			}
		} );
	} );
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	var namespace = elem && elem.namespaceURI,
		docElem = elem && ( elem.ownerDocument || elem ).documentElement;

	// Support: IE <=8
	// Assume HTML when documentElement doesn't yet exist, such as inside loading iframes
	// https://bugs.jquery.com/ticket/4833
	return !rhtml.test( namespace || docElem && docElem.nodeName || "HTML" );
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare, subWindow,
		doc = node ? node.ownerDocument || node : preferredDoc;

	// Return early if doc is invalid or already selected
	// Support: IE 11+, Edge 17 - 18+
	// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( doc == document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Update global variables
	document = doc;
	docElem = document.documentElement;
	documentIsHTML = !isXML( document );

	// Support: IE 9 - 11+, Edge 12 - 18+
	// Accessing iframe documents after unload throws "permission denied" errors (jQuery #13936)
	// Support: IE 11+, Edge 17 - 18+
	// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( preferredDoc != document &&
		( subWindow = document.defaultView ) && subWindow.top !== subWindow ) {

		// Support: IE 11, Edge
		if ( subWindow.addEventListener ) {
			subWindow.addEventListener( "unload", unloadHandler, false );

		// Support: IE 9 - 10 only
		} else if ( subWindow.attachEvent ) {
			subWindow.attachEvent( "onunload", unloadHandler );
		}
	}

	// Support: IE 8 - 11+, Edge 12 - 18+, Chrome <=16 - 25 only, Firefox <=3.6 - 31 only,
	// Safari 4 - 5 only, Opera <=11.6 - 12.x only
	// IE/Edge & older browsers don't support the :scope pseudo-class.
	// Support: Safari 6.0 only
	// Safari 6.0 supports :scope but it's an alias of :root there.
	support.scope = assert( function( el ) {
		docElem.appendChild( el ).appendChild( document.createElement( "div" ) );
		return typeof el.querySelectorAll !== "undefined" &&
			!el.querySelectorAll( ":scope fieldset div" ).length;
	} );

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties
	// (excepting IE8 booleans)
	support.attributes = assert( function( el ) {
		el.className = "i";
		return !el.getAttribute( "className" );
	} );

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert( function( el ) {
		el.appendChild( document.createComment( "" ) );
		return !el.getElementsByTagName( "*" ).length;
	} );

	// Support: IE<9
	support.getElementsByClassName = rnative.test( document.getElementsByClassName );

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programmatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert( function( el ) {
		docElem.appendChild( el ).id = expando;
		return !document.getElementsByName || !document.getElementsByName( expando ).length;
	} );

	// ID filter and find
	if ( support.getById ) {
		Expr.filter[ "ID" ] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute( "id" ) === attrId;
			};
		};
		Expr.find[ "ID" ] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var elem = context.getElementById( id );
				return elem ? [ elem ] : [];
			}
		};
	} else {
		Expr.filter[ "ID" ] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== "undefined" &&
					elem.getAttributeNode( "id" );
				return node && node.value === attrId;
			};
		};

		// Support: IE 6 - 7 only
		// getElementById is not reliable as a find shortcut
		Expr.find[ "ID" ] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var node, i, elems,
					elem = context.getElementById( id );

				if ( elem ) {

					// Verify the id attribute
					node = elem.getAttributeNode( "id" );
					if ( node && node.value === id ) {
						return [ elem ];
					}

					// Fall back on getElementsByName
					elems = context.getElementsByName( id );
					i = 0;
					while ( ( elem = elems[ i++ ] ) ) {
						node = elem.getAttributeNode( "id" );
						if ( node && node.value === id ) {
							return [ elem ];
						}
					}
				}

				return [];
			}
		};
	}

	// Tag
	Expr.find[ "TAG" ] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== "undefined" ) {
				return context.getElementsByTagName( tag );

			// DocumentFragment nodes don't have gEBTN
			} else if ( support.qsa ) {
				return context.querySelectorAll( tag );
			}
		} :

		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,

				// By happy coincidence, a (broken) gEBTN appears on DocumentFragment nodes too
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( ( elem = results[ i++ ] ) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find[ "CLASS" ] = support.getElementsByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== "undefined" && documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See https://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( ( support.qsa = rnative.test( document.querySelectorAll ) ) ) {

		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert( function( el ) {

			var input;

			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// https://bugs.jquery.com/ticket/12359
			docElem.appendChild( el ).innerHTML = "<a id='" + expando + "'></a>" +
				"<select id='" + expando + "-\r\\' msallowcapture=''>" +
				"<option selected=''></option></select>";

			// Support: IE8, Opera 11-12.16
			// Nothing should be selected when empty strings follow ^= or $= or *=
			// The test attribute must be unknown in Opera but "safe" for WinRT
			// https://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
			if ( el.querySelectorAll( "[msallowcapture^='']" ).length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !el.querySelectorAll( "[selected]" ).length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Support: Chrome<29, Android<4.4, Safari<7.0+, iOS<7.0+, PhantomJS<1.9.8+
			if ( !el.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
				rbuggyQSA.push( "~=" );
			}

			// Support: IE 11+, Edge 15 - 18+
			// IE 11/Edge don't find elements on a `[name='']` query in some cases.
			// Adding a temporary attribute to the document before the selection works
			// around the issue.
			// Interestingly, IE 10 & older don't seem to have the issue.
			input = document.createElement( "input" );
			input.setAttribute( "name", "" );
			el.appendChild( input );
			if ( !el.querySelectorAll( "[name='']" ).length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*name" + whitespace + "*=" +
					whitespace + "*(?:''|\"\")" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !el.querySelectorAll( ":checked" ).length ) {
				rbuggyQSA.push( ":checked" );
			}

			// Support: Safari 8+, iOS 8+
			// https://bugs.webkit.org/show_bug.cgi?id=136851
			// In-page `selector#id sibling-combinator selector` fails
			if ( !el.querySelectorAll( "a#" + expando + "+*" ).length ) {
				rbuggyQSA.push( ".#.+[+~]" );
			}

			// Support: Firefox <=3.6 - 5 only
			// Old Firefox doesn't throw on a badly-escaped identifier.
			el.querySelectorAll( "\\\f" );
			rbuggyQSA.push( "[\\r\\n\\f]" );
		} );

		assert( function( el ) {
			el.innerHTML = "<a href='' disabled='disabled'></a>" +
				"<select disabled='disabled'><option/></select>";

			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = document.createElement( "input" );
			input.setAttribute( "type", "hidden" );
			el.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( el.querySelectorAll( "[name=d]" ).length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( el.querySelectorAll( ":enabled" ).length !== 2 ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Support: IE9-11+
			// IE's :disabled selector does not pick up the children of disabled fieldsets
			docElem.appendChild( el ).disabled = true;
			if ( el.querySelectorAll( ":disabled" ).length !== 2 ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Support: Opera 10 - 11 only
			// Opera 10-11 does not throw on post-comma invalid pseudos
			el.querySelectorAll( "*,:x" );
			rbuggyQSA.push( ",.*:" );
		} );
	}

	if ( ( support.matchesSelector = rnative.test( ( matches = docElem.matches ||
		docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector ) ) ) ) {

		assert( function( el ) {

			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( el, "*" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( el, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		} );
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join( "|" ) );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join( "|" ) );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully self-exclusive
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			) );
		} :
		function( a, b ) {
			if ( b ) {
				while ( ( b = b.parentNode ) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		// Support: IE 11+, Edge 17 - 18+
		// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
		// two documents; shallow comparisons work.
		// eslint-disable-next-line eqeqeq
		compare = ( a.ownerDocument || a ) == ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			( !support.sortDetached && b.compareDocumentPosition( a ) === compare ) ) {

			// Choose the first element that is related to our preferred document
			// Support: IE 11+, Edge 17 - 18+
			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
			// two documents; shallow comparisons work.
			// eslint-disable-next-line eqeqeq
			if ( a == document || a.ownerDocument == preferredDoc &&
				contains( preferredDoc, a ) ) {
				return -1;
			}

			// Support: IE 11+, Edge 17 - 18+
			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
			// two documents; shallow comparisons work.
			// eslint-disable-next-line eqeqeq
			if ( b == document || b.ownerDocument == preferredDoc &&
				contains( preferredDoc, b ) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {

		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {

			// Support: IE 11+, Edge 17 - 18+
			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
			// two documents; shallow comparisons work.
			/* eslint-disable eqeqeq */
			return a == document ? -1 :
				b == document ? 1 :
				/* eslint-enable eqeqeq */
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( ( cur = cur.parentNode ) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( ( cur = cur.parentNode ) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[ i ] === bp[ i ] ) {
			i++;
		}

		return i ?

			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[ i ], bp[ i ] ) :

			// Otherwise nodes in our document sort first
			// Support: IE 11+, Edge 17 - 18+
			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
			// two documents; shallow comparisons work.
			/* eslint-disable eqeqeq */
			ap[ i ] == preferredDoc ? -1 :
			bp[ i ] == preferredDoc ? 1 :
			/* eslint-enable eqeqeq */
			0;
	};

	return document;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	setDocument( elem );

	if ( support.matchesSelector && documentIsHTML &&
		!nonnativeSelectorCache[ expr + " " ] &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||

				// As well, disconnected nodes are said to be in a document
				// fragment in IE 9
				elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch ( e ) {
			nonnativeSelectorCache( expr, true );
		}
	}

	return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {

	// Set document vars if needed
	// Support: IE 11+, Edge 17 - 18+
	// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( ( context.ownerDocument || context ) != document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {

	// Set document vars if needed
	// Support: IE 11+, Edge 17 - 18+
	// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
	// two documents; shallow comparisons work.
	// eslint-disable-next-line eqeqeq
	if ( ( elem.ownerDocument || elem ) != document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],

		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			( val = elem.getAttributeNode( name ) ) && val.specified ?
				val.value :
				null;
};

Sizzle.escape = function( sel ) {
	return ( sel + "" ).replace( rcssescape, fcssescape );
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( ( elem = results[ i++ ] ) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {

		// If no nodeType, this is expected to be an array
		while ( ( node = elem[ i++ ] ) ) {

			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {

		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {

			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}

	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[ 1 ] = match[ 1 ].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[ 3 ] = ( match[ 3 ] || match[ 4 ] ||
				match[ 5 ] || "" ).replace( runescape, funescape );

			if ( match[ 2 ] === "~=" ) {
				match[ 3 ] = " " + match[ 3 ] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {

			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[ 1 ] = match[ 1 ].toLowerCase();

			if ( match[ 1 ].slice( 0, 3 ) === "nth" ) {

				// nth-* requires argument
				if ( !match[ 3 ] ) {
					Sizzle.error( match[ 0 ] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[ 4 ] = +( match[ 4 ] ?
					match[ 5 ] + ( match[ 6 ] || 1 ) :
					2 * ( match[ 3 ] === "even" || match[ 3 ] === "odd" ) );
				match[ 5 ] = +( ( match[ 7 ] + match[ 8 ] ) || match[ 3 ] === "odd" );

				// other types prohibit arguments
			} else if ( match[ 3 ] ) {
				Sizzle.error( match[ 0 ] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[ 6 ] && match[ 2 ];

			if ( matchExpr[ "CHILD" ].test( match[ 0 ] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[ 3 ] ) {
				match[ 2 ] = match[ 4 ] || match[ 5 ] || "";

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&

				// Get excess from tokenize (recursively)
				( excess = tokenize( unquoted, true ) ) &&

				// advance to the next closing parenthesis
				( excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length ) ) {

				// excess is a negative index
				match[ 0 ] = match[ 0 ].slice( 0, excess );
				match[ 2 ] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() {
					return true;
				} :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				( pattern = new RegExp( "(^|" + whitespace +
					")" + className + "(" + whitespace + "|$)" ) ) && classCache(
						className, function( elem ) {
							return pattern.test(
								typeof elem.className === "string" && elem.className ||
								typeof elem.getAttribute !== "undefined" &&
									elem.getAttribute( "class" ) ||
								""
							);
				} );
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				/* eslint-disable max-len */

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result.replace( rwhitespace, " " ) + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
				/* eslint-enable max-len */

			};
		},

		"CHILD": function( type, what, _argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, _context, xml ) {
					var cache, uniqueCache, outerCache, node, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType,
						diff = false;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( ( node = node[ dir ] ) ) {
									if ( ofType ?
										node.nodeName.toLowerCase() === name :
										node.nodeType === 1 ) {

										return false;
									}
								}

								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {

							// Seek `elem` from a previously-cached index

							// ...in a gzip-friendly way
							node = parent;
							outerCache = node[ expando ] || ( node[ expando ] = {} );

							// Support: IE <9 only
							// Defend against cloned attroperties (jQuery gh-1709)
							uniqueCache = outerCache[ node.uniqueID ] ||
								( outerCache[ node.uniqueID ] = {} );

							cache = uniqueCache[ type ] || [];
							nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
							diff = nodeIndex && cache[ 2 ];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( ( node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								( diff = nodeIndex = 0 ) || start.pop() ) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									uniqueCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						} else {

							// Use previously-cached element index if available
							if ( useCache ) {

								// ...in a gzip-friendly way
								node = elem;
								outerCache = node[ expando ] || ( node[ expando ] = {} );

								// Support: IE <9 only
								// Defend against cloned attroperties (jQuery gh-1709)
								uniqueCache = outerCache[ node.uniqueID ] ||
									( outerCache[ node.uniqueID ] = {} );

								cache = uniqueCache[ type ] || [];
								nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
								diff = nodeIndex;
							}

							// xml :nth-child(...)
							// or :nth-last-child(...) or :nth(-last)?-of-type(...)
							if ( diff === false ) {

								// Use the same loop as above to seek `elem` from the start
								while ( ( node = ++nodeIndex && node && node[ dir ] ||
									( diff = nodeIndex = 0 ) || start.pop() ) ) {

									if ( ( ofType ?
										node.nodeName.toLowerCase() === name :
										node.nodeType === 1 ) &&
										++diff ) {

										// Cache the index of each encountered element
										if ( useCache ) {
											outerCache = node[ expando ] ||
												( node[ expando ] = {} );

											// Support: IE <9 only
											// Defend against cloned attroperties (jQuery gh-1709)
											uniqueCache = outerCache[ node.uniqueID ] ||
												( outerCache[ node.uniqueID ] = {} );

											uniqueCache[ type ] = [ dirruns, diff ];
										}

										if ( node === elem ) {
											break;
										}
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {

			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction( function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf( seed, matched[ i ] );
							seed[ idx ] = !( matches[ idx ] = matched[ i ] );
						}
					} ) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {

		// Potentially complex pseudos
		"not": markFunction( function( selector ) {

			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction( function( seed, matches, _context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( ( elem = unmatched[ i ] ) ) {
							seed[ i ] = !( matches[ i ] = elem );
						}
					}
				} ) :
				function( elem, _context, xml ) {
					input[ 0 ] = elem;
					matcher( input, null, xml, results );

					// Don't keep the element (issue #299)
					input[ 0 ] = null;
					return !results.pop();
				};
		} ),

		"has": markFunction( function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		} ),

		"contains": markFunction( function( text ) {
			text = text.replace( runescape, funescape );
			return function( elem ) {
				return ( elem.textContent || getText( elem ) ).indexOf( text ) > -1;
			};
		} ),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {

			// lang value must be a valid identifier
			if ( !ridentifier.test( lang || "" ) ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( ( elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute( "xml:lang" ) || elem.getAttribute( "lang" ) ) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( ( elem = elem.parentNode ) && elem.nodeType === 1 );
				return false;
			};
		} ),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement &&
				( !document.hasFocus || document.hasFocus() ) &&
				!!( elem.type || elem.href || ~elem.tabIndex );
		},

		// Boolean properties
		"enabled": createDisabledPseudo( false ),
		"disabled": createDisabledPseudo( true ),

		"checked": function( elem ) {

			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return ( nodeName === "input" && !!elem.checked ) ||
				( nodeName === "option" && !!elem.selected );
		},

		"selected": function( elem ) {

			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				// eslint-disable-next-line no-unused-expressions
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {

			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos[ "empty" ]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( ( attr = elem.getAttribute( "type" ) ) == null ||
					attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo( function() {
			return [ 0 ];
		} ),

		"last": createPositionalPseudo( function( _matchIndexes, length ) {
			return [ length - 1 ];
		} ),

		"eq": createPositionalPseudo( function( _matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		} ),

		"even": createPositionalPseudo( function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} ),

		"odd": createPositionalPseudo( function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} ),

		"lt": createPositionalPseudo( function( matchIndexes, length, argument ) {
			var i = argument < 0 ?
				argument + length :
				argument > length ?
					length :
					argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} ),

		"gt": createPositionalPseudo( function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		} )
	}
};

Expr.pseudos[ "nth" ] = Expr.pseudos[ "eq" ];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || ( match = rcomma.exec( soFar ) ) ) {
			if ( match ) {

				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[ 0 ].length ) || soFar;
			}
			groups.push( ( tokens = [] ) );
		}

		matched = false;

		// Combinators
		if ( ( match = rcombinators.exec( soFar ) ) ) {
			matched = match.shift();
			tokens.push( {
				value: matched,

				// Cast descendant combinators to space
				type: match[ 0 ].replace( rtrim, " " )
			} );
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( ( match = matchExpr[ type ].exec( soFar ) ) && ( !preFilters[ type ] ||
				( match = preFilters[ type ]( match ) ) ) ) {
				matched = match.shift();
				tokens.push( {
					value: matched,
					type: type,
					matches: match
				} );
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :

			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[ i ].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		skip = combinator.next,
		key = skip || dir,
		checkNonElements = base && key === "parentNode",
		doneName = done++;

	return combinator.first ?

		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( ( elem = elem[ dir ] ) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
			return false;
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, uniqueCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from combinator caching
			if ( xml ) {
				while ( ( elem = elem[ dir ] ) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( ( elem = elem[ dir ] ) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || ( elem[ expando ] = {} );

						// Support: IE <9 only
						// Defend against cloned attroperties (jQuery gh-1709)
						uniqueCache = outerCache[ elem.uniqueID ] ||
							( outerCache[ elem.uniqueID ] = {} );

						if ( skip && skip === elem.nodeName.toLowerCase() ) {
							elem = elem[ dir ] || elem;
						} else if ( ( oldCache = uniqueCache[ key ] ) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return ( newCache[ 2 ] = oldCache[ 2 ] );
						} else {

							// Reuse newcache so results back-propagate to previous elements
							uniqueCache[ key ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( ( newCache[ 2 ] = matcher( elem, context, xml ) ) ) {
								return true;
							}
						}
					}
				}
			}
			return false;
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[ i ]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[ 0 ];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[ i ], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( ( elem = unmatched[ i ] ) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction( function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts(
				selector || "*",
				context.nodeType ? [ context ] : context,
				[]
			),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?

				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( ( elem = temp[ i ] ) ) {
					matcherOut[ postMap[ i ] ] = !( matcherIn[ postMap[ i ] ] = elem );
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {

					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( ( elem = matcherOut[ i ] ) ) {

							// Restore matcherIn since elem is not yet a final match
							temp.push( ( matcherIn[ i ] = elem ) );
						}
					}
					postFinder( null, ( matcherOut = [] ), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( ( elem = matcherOut[ i ] ) &&
						( temp = postFinder ? indexOf( seed, elem ) : preMap[ i ] ) > -1 ) {

						seed[ temp ] = !( results[ temp ] = elem );
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	} );
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[ 0 ].type ],
		implicitRelative = leadingRelative || Expr.relative[ " " ],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			var ret = ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				( checkContext = context ).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );

			// Avoid hanging onto element (issue #299)
			checkContext = null;
			return ret;
		} ];

	for ( ; i < len; i++ ) {
		if ( ( matcher = Expr.relative[ tokens[ i ].type ] ) ) {
			matchers = [ addCombinator( elementMatcher( matchers ), matcher ) ];
		} else {
			matcher = Expr.filter[ tokens[ i ].type ].apply( null, tokens[ i ].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {

				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[ j ].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(

					// If the preceding token was a descendant combinator, insert an implicit any-element `*`
					tokens
						.slice( 0, i - 1 )
						.concat( { value: tokens[ i - 2 ].type === " " ? "*" : "" } )
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( ( tokens = tokens.slice( j ) ) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,

				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find[ "TAG" ]( "*", outermost ),

				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = ( dirruns += contextBackup == null ? 1 : Math.random() || 0.1 ),
				len = elems.length;

			if ( outermost ) {

				// Support: IE 11+, Edge 17 - 18+
				// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
				// two documents; shallow comparisons work.
				// eslint-disable-next-line eqeqeq
				outermostContext = context == document || context || outermost;
			}

			// Add elements passing elementMatchers directly to results
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && ( elem = elems[ i ] ) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;

					// Support: IE 11+, Edge 17 - 18+
					// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
					// two documents; shallow comparisons work.
					// eslint-disable-next-line eqeqeq
					if ( !context && elem.ownerDocument != document ) {
						setDocument( elem );
						xml = !documentIsHTML;
					}
					while ( ( matcher = elementMatchers[ j++ ] ) ) {
						if ( matcher( elem, context || document, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {

					// They will have gone through all possible matchers
					if ( ( elem = !matcher && elem ) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// `i` is now the count of elements visited above, and adding it to `matchedCount`
			// makes the latter nonnegative.
			matchedCount += i;

			// Apply set filters to unmatched elements
			// NOTE: This can be skipped if there are no unmatched elements (i.e., `matchedCount`
			// equals `i`), unless we didn't visit _any_ elements in the above loop because we have
			// no element matchers and no seed.
			// Incrementing an initially-string "0" `i` allows `i` to remain a string only in that
			// case, which will result in a "00" `matchedCount` that differs from `i` but is also
			// numerically zero.
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( ( matcher = setMatchers[ j++ ] ) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {

					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !( unmatched[ i ] || setMatched[ i ] ) ) {
								setMatched[ i ] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {

		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[ i ] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache(
			selector,
			matcherFromGroupMatchers( elementMatchers, setMatchers )
		);

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( ( selector = compiled.selector || selector ) );

	results = results || [];

	// Try to minimize operations if there is only one selector in the list and no seed
	// (the latter of which guarantees us context)
	if ( match.length === 1 ) {

		// Reduce context if the leading compound selector is an ID
		tokens = match[ 0 ] = match[ 0 ].slice( 0 );
		if ( tokens.length > 2 && ( token = tokens[ 0 ] ).type === "ID" &&
			context.nodeType === 9 && documentIsHTML && Expr.relative[ tokens[ 1 ].type ] ) {

			context = ( Expr.find[ "ID" ]( token.matches[ 0 ]
				.replace( runescape, funescape ), context ) || [] )[ 0 ];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr[ "needsContext" ].test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[ i ];

			// Abort if we hit a combinator
			if ( Expr.relative[ ( type = token.type ) ] ) {
				break;
			}
			if ( ( find = Expr.find[ type ] ) ) {

				// Search, expanding context for leading sibling combinators
				if ( ( seed = find(
					token.matches[ 0 ].replace( runescape, funescape ),
					rsibling.test( tokens[ 0 ].type ) && testContext( context.parentNode ) ||
						context
				) ) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		!context || rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split( "" ).sort( sortOrder ).join( "" ) === expando;

// Support: Chrome 14-35+
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert( function( el ) {

	// Should return 1, but returns 4 (following)
	return el.compareDocumentPosition( document.createElement( "fieldset" ) ) & 1;
} );

// Support: IE<8
// Prevent attribute/property "interpolation"
// https://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert( function( el ) {
	el.innerHTML = "<a href='#'></a>";
	return el.firstChild.getAttribute( "href" ) === "#";
} ) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	} );
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert( function( el ) {
	el.innerHTML = "<input/>";
	el.firstChild.setAttribute( "value", "" );
	return el.firstChild.getAttribute( "value" ) === "";
} ) ) {
	addHandle( "value", function( elem, _name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	} );
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert( function( el ) {
	return el.getAttribute( "disabled" ) == null;
} ) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
				( val = elem.getAttributeNode( name ) ) && val.specified ?
					val.value :
					null;
		}
	} );
}

return Sizzle;

} )( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;

// Deprecated
jQuery.expr[ ":" ] = jQuery.expr.pseudos;
jQuery.uniqueSort = jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;
jQuery.escapeSelector = Sizzle.escape;




var dir = function( elem, dir, until ) {
	var matched = [],
		truncate = until !== undefined;

	while ( ( elem = elem[ dir ] ) && elem.nodeType !== 9 ) {
		if ( elem.nodeType === 1 ) {
			if ( truncate && jQuery( elem ).is( until ) ) {
				break;
			}
			matched.push( elem );
		}
	}
	return matched;
};


var siblings = function( n, elem ) {
	var matched = [];

	for ( ; n; n = n.nextSibling ) {
		if ( n.nodeType === 1 && n !== elem ) {
			matched.push( n );
		}
	}

	return matched;
};


var rneedsContext = jQuery.expr.match.needsContext;



function nodeName( elem, name ) {

	return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();

}
var rsingleTag = ( /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i );



// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			return !!qualifier.call( elem, i, elem ) !== not;
		} );
	}

	// Single element
	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		} );
	}

	// Arraylike of elements (jQuery, arguments, Array)
	if ( typeof qualifier !== "string" ) {
		return jQuery.grep( elements, function( elem ) {
			return ( indexOf.call( qualifier, elem ) > -1 ) !== not;
		} );
	}

	// Filtered directly for both simple and complex selectors
	return jQuery.filter( qualifier, elements, not );
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	if ( elems.length === 1 && elem.nodeType === 1 ) {
		return jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [];
	}

	return jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
		return elem.nodeType === 1;
	} ) );
};

jQuery.fn.extend( {
	find: function( selector ) {
		var i, ret,
			len = this.length,
			self = this;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter( function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			} ) );
		}

		ret = this.pushStack( [] );

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		return len > 1 ? jQuery.uniqueSort( ret ) : ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow( this, selector || [], false ) );
	},
	not: function( selector ) {
		return this.pushStack( winnow( this, selector || [], true ) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
} );


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	// Shortcut simple #id case for speed
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/,

	init = jQuery.fn.init = function( selector, context, root ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Method init() accepts an alternate rootjQuery
		// so migrate can support jQuery.sub (gh-2101)
		root = root || rootjQuery;

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector[ 0 ] === "<" &&
				selector[ selector.length - 1 ] === ">" &&
				selector.length >= 3 ) {

				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && ( match[ 1 ] || !context ) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[ 1 ] ) {
					context = context instanceof jQuery ? context[ 0 ] : context;

					// Option to run scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[ 1 ],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[ 1 ] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {

							// Properties of context are called as methods if possible
							if ( isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[ 2 ] );

					if ( elem ) {

						// Inject the element directly into the jQuery object
						this[ 0 ] = elem;
						this.length = 1;
					}
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || root ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this[ 0 ] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( isFunction( selector ) ) {
			return root.ready !== undefined ?
				root.ready( selector ) :

				// Execute immediately if ready is not present
				selector( jQuery );
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,

	// Methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend( {
	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter( function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[ i ] ) ) {
					return true;
				}
			}
		} );
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			targets = typeof selectors !== "string" && jQuery( selectors );

		// Positional selectors never match, since there's no _selection_ context
		if ( !rneedsContext.test( selectors ) ) {
			for ( ; i < l; i++ ) {
				for ( cur = this[ i ]; cur && cur !== context; cur = cur.parentNode ) {

					// Always skip document fragments
					if ( cur.nodeType < 11 && ( targets ?
						targets.index( cur ) > -1 :

						// Don't pass non-elements to Sizzle
						cur.nodeType === 1 &&
							jQuery.find.matchesSelector( cur, selectors ) ) ) {

						matched.push( cur );
						break;
					}
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.uniqueSort( matched ) : matched );
	},

	// Determine the position of an element within the set
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// Index in selector
		if ( typeof elem === "string" ) {
			return indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.uniqueSort(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter( selector )
		);
	}
} );

function sibling( cur, dir ) {
	while ( ( cur = cur[ dir ] ) && cur.nodeType !== 1 ) {}
	return cur;
}

jQuery.each( {
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, _i, until ) {
		return dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, _i, until ) {
		return dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, _i, until ) {
		return dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return siblings( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return siblings( elem.firstChild );
	},
	contents: function( elem ) {
		if ( elem.contentDocument != null &&

			// Support: IE 11+
			// <object> elements with no `data` attribute has an object
			// `contentDocument` with a `null` prototype.
			getProto( elem.contentDocument ) ) {

			return elem.contentDocument;
		}

		// Support: IE 9 - 11 only, iOS 7 only, Android Browser <=4.3 only
		// Treat the template element as a regular one in browsers that
		// don't support it.
		if ( nodeName( elem, "template" ) ) {
			elem = elem.content || elem;
		}

		return jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {

			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.uniqueSort( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
} );
var rnothtmlwhite = ( /[^\x20\t\r\n\f]+/g );



// Convert String-formatted options into Object-formatted ones
function createOptions( options ) {
	var object = {};
	jQuery.each( options.match( rnothtmlwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	} );
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		createOptions( options ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,

		// Last fire value for non-forgettable lists
		memory,

		// Flag to know if list was already fired
		fired,

		// Flag to prevent firing
		locked,

		// Actual callback list
		list = [],

		// Queue of execution data for repeatable lists
		queue = [],

		// Index of currently firing callback (modified by add/remove as needed)
		firingIndex = -1,

		// Fire callbacks
		fire = function() {

			// Enforce single-firing
			locked = locked || options.once;

			// Execute callbacks for all pending executions,
			// respecting firingIndex overrides and runtime changes
			fired = firing = true;
			for ( ; queue.length; firingIndex = -1 ) {
				memory = queue.shift();
				while ( ++firingIndex < list.length ) {

					// Run callback and check for early termination
					if ( list[ firingIndex ].apply( memory[ 0 ], memory[ 1 ] ) === false &&
						options.stopOnFalse ) {

						// Jump to end and forget the data so .add doesn't re-fire
						firingIndex = list.length;
						memory = false;
					}
				}
			}

			// Forget the data if we're done with it
			if ( !options.memory ) {
				memory = false;
			}

			firing = false;

			// Clean up if we're done firing for good
			if ( locked ) {

				// Keep an empty list if we have data for future add calls
				if ( memory ) {
					list = [];

				// Otherwise, this object is spent
				} else {
					list = "";
				}
			}
		},

		// Actual Callbacks object
		self = {

			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {

					// If we have memory from a past run, we should fire after adding
					if ( memory && !firing ) {
						firingIndex = list.length - 1;
						queue.push( memory );
					}

					( function add( args ) {
						jQuery.each( args, function( _, arg ) {
							if ( isFunction( arg ) ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && toType( arg ) !== "string" ) {

								// Inspect recursively
								add( arg );
							}
						} );
					} )( arguments );

					if ( memory && !firing ) {
						fire();
					}
				}
				return this;
			},

			// Remove a callback from the list
			remove: function() {
				jQuery.each( arguments, function( _, arg ) {
					var index;
					while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
						list.splice( index, 1 );

						// Handle firing indexes
						if ( index <= firingIndex ) {
							firingIndex--;
						}
					}
				} );
				return this;
			},

			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ?
					jQuery.inArray( fn, list ) > -1 :
					list.length > 0;
			},

			// Remove all callbacks from the list
			empty: function() {
				if ( list ) {
					list = [];
				}
				return this;
			},

			// Disable .fire and .add
			// Abort any current/pending executions
			// Clear all callbacks and values
			disable: function() {
				locked = queue = [];
				list = memory = "";
				return this;
			},
			disabled: function() {
				return !list;
			},

			// Disable .fire
			// Also disable .add unless we have memory (since it would have no effect)
			// Abort any pending executions
			lock: function() {
				locked = queue = [];
				if ( !memory && !firing ) {
					list = memory = "";
				}
				return this;
			},
			locked: function() {
				return !!locked;
			},

			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( !locked ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					queue.push( args );
					if ( !firing ) {
						fire();
					}
				}
				return this;
			},

			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},

			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


function Identity( v ) {
	return v;
}
function Thrower( ex ) {
	throw ex;
}

function adoptValue( value, resolve, reject, noValue ) {
	var method;

	try {

		// Check for promise aspect first to privilege synchronous behavior
		if ( value && isFunction( ( method = value.promise ) ) ) {
			method.call( value ).done( resolve ).fail( reject );

		// Other thenables
		} else if ( value && isFunction( ( method = value.then ) ) ) {
			method.call( value, resolve, reject );

		// Other non-thenables
		} else {

			// Control `resolve` arguments by letting Array#slice cast boolean `noValue` to integer:
			// * false: [ value ].slice( 0 ) => resolve( value )
			// * true: [ value ].slice( 1 ) => resolve()
			resolve.apply( undefined, [ value ].slice( noValue ) );
		}

	// For Promises/A+, convert exceptions into rejections
	// Since jQuery.when doesn't unwrap thenables, we can skip the extra checks appearing in
	// Deferred#then to conditionally suppress rejection.
	} catch ( value ) {

		// Support: Android 4.0 only
		// Strict mode functions invoked without .call/.apply get global-object context
		reject.apply( undefined, [ value ] );
	}
}

jQuery.extend( {

	Deferred: function( func ) {
		var tuples = [

				// action, add listener, callbacks,
				// ... .then handlers, argument index, [final state]
				[ "notify", "progress", jQuery.Callbacks( "memory" ),
					jQuery.Callbacks( "memory" ), 2 ],
				[ "resolve", "done", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 0, "resolved" ],
				[ "reject", "fail", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 1, "rejected" ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				"catch": function( fn ) {
					return promise.then( null, fn );
				},

				// Keep pipe for back-compat
				pipe: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;

					return jQuery.Deferred( function( newDefer ) {
						jQuery.each( tuples, function( _i, tuple ) {

							// Map tuples (progress, done, fail) to arguments (done, fail, progress)
							var fn = isFunction( fns[ tuple[ 4 ] ] ) && fns[ tuple[ 4 ] ];

							// deferred.progress(function() { bind to newDefer or newDefer.notify })
							// deferred.done(function() { bind to newDefer or newDefer.resolve })
							// deferred.fail(function() { bind to newDefer or newDefer.reject })
							deferred[ tuple[ 1 ] ]( function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && isFunction( returned.promise ) ) {
									returned.promise()
										.progress( newDefer.notify )
										.done( newDefer.resolve )
										.fail( newDefer.reject );
								} else {
									newDefer[ tuple[ 0 ] + "With" ](
										this,
										fn ? [ returned ] : arguments
									);
								}
							} );
						} );
						fns = null;
					} ).promise();
				},
				then: function( onFulfilled, onRejected, onProgress ) {
					var maxDepth = 0;
					function resolve( depth, deferred, handler, special ) {
						return function() {
							var that = this,
								args = arguments,
								mightThrow = function() {
									var returned, then;

									// Support: Promises/A+ section 2.3.3.3.3
									// https://promisesaplus.com/#point-59
									// Ignore double-resolution attempts
									if ( depth < maxDepth ) {
										return;
									}

									returned = handler.apply( that, args );

									// Support: Promises/A+ section 2.3.1
									// https://promisesaplus.com/#point-48
									if ( returned === deferred.promise() ) {
										throw new TypeError( "Thenable self-resolution" );
									}

									// Support: Promises/A+ sections 2.3.3.1, 3.5
									// https://promisesaplus.com/#point-54
									// https://promisesaplus.com/#point-75
									// Retrieve `then` only once
									then = returned &&

										// Support: Promises/A+ section 2.3.4
										// https://promisesaplus.com/#point-64
										// Only check objects and functions for thenability
										( typeof returned === "object" ||
											typeof returned === "function" ) &&
										returned.then;

									// Handle a returned thenable
									if ( isFunction( then ) ) {

										// Special processors (notify) just wait for resolution
										if ( special ) {
											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special )
											);

										// Normal processors (resolve) also hook into progress
										} else {

											// ...and disregard older resolution values
											maxDepth++;

											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special ),
												resolve( maxDepth, deferred, Identity,
													deferred.notifyWith )
											);
										}

									// Handle all other returned values
									} else {

										// Only substitute handlers pass on context
										// and multiple values (non-spec behavior)
										if ( handler !== Identity ) {
											that = undefined;
											args = [ returned ];
										}

										// Process the value(s)
										// Default process is resolve
										( special || deferred.resolveWith )( that, args );
									}
								},

								// Only normal processors (resolve) catch and reject exceptions
								process = special ?
									mightThrow :
									function() {
										try {
											mightThrow();
										} catch ( e ) {

											if ( jQuery.Deferred.exceptionHook ) {
												jQuery.Deferred.exceptionHook( e,
													process.stackTrace );
											}

											// Support: Promises/A+ section 2.3.3.3.4.1
											// https://promisesaplus.com/#point-61
											// Ignore post-resolution exceptions
											if ( depth + 1 >= maxDepth ) {

												// Only substitute handlers pass on context
												// and multiple values (non-spec behavior)
												if ( handler !== Thrower ) {
													that = undefined;
													args = [ e ];
												}

												deferred.rejectWith( that, args );
											}
										}
									};

							// Support: Promises/A+ section 2.3.3.3.1
							// https://promisesaplus.com/#point-57
							// Re-resolve promises immediately to dodge false rejection from
							// subsequent errors
							if ( depth ) {
								process();
							} else {

								// Call an optional hook to record the stack, in case of exception
								// since it's otherwise lost when execution goes async
								if ( jQuery.Deferred.getStackHook ) {
									process.stackTrace = jQuery.Deferred.getStackHook();
								}
								window.setTimeout( process );
							}
						};
					}

					return jQuery.Deferred( function( newDefer ) {

						// progress_handlers.add( ... )
						tuples[ 0 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onProgress ) ?
									onProgress :
									Identity,
								newDefer.notifyWith
							)
						);

						// fulfilled_handlers.add( ... )
						tuples[ 1 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onFulfilled ) ?
									onFulfilled :
									Identity
							)
						);

						// rejected_handlers.add( ... )
						tuples[ 2 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onRejected ) ?
									onRejected :
									Thrower
							)
						);
					} ).promise();
				},

				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 5 ];

			// promise.progress = list.add
			// promise.done = list.add
			// promise.fail = list.add
			promise[ tuple[ 1 ] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(
					function() {

						// state = "resolved" (i.e., fulfilled)
						// state = "rejected"
						state = stateString;
					},

					// rejected_callbacks.disable
					// fulfilled_callbacks.disable
					tuples[ 3 - i ][ 2 ].disable,

					// rejected_handlers.disable
					// fulfilled_handlers.disable
					tuples[ 3 - i ][ 3 ].disable,

					// progress_callbacks.lock
					tuples[ 0 ][ 2 ].lock,

					// progress_handlers.lock
					tuples[ 0 ][ 3 ].lock
				);
			}

			// progress_handlers.fire
			// fulfilled_handlers.fire
			// rejected_handlers.fire
			list.add( tuple[ 3 ].fire );

			// deferred.notify = function() { deferred.notifyWith(...) }
			// deferred.resolve = function() { deferred.resolveWith(...) }
			// deferred.reject = function() { deferred.rejectWith(...) }
			deferred[ tuple[ 0 ] ] = function() {
				deferred[ tuple[ 0 ] + "With" ]( this === deferred ? undefined : this, arguments );
				return this;
			};

			// deferred.notifyWith = list.fireWith
			// deferred.resolveWith = list.fireWith
			// deferred.rejectWith = list.fireWith
			deferred[ tuple[ 0 ] + "With" ] = list.fireWith;
		} );

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( singleValue ) {
		var

			// count of uncompleted subordinates
			remaining = arguments.length,

			// count of unprocessed arguments
			i = remaining,

			// subordinate fulfillment data
			resolveContexts = Array( i ),
			resolveValues = slice.call( arguments ),

			// the primary Deferred
			primary = jQuery.Deferred(),

			// subordinate callback factory
			updateFunc = function( i ) {
				return function( value ) {
					resolveContexts[ i ] = this;
					resolveValues[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( !( --remaining ) ) {
						primary.resolveWith( resolveContexts, resolveValues );
					}
				};
			};

		// Single- and empty arguments are adopted like Promise.resolve
		if ( remaining <= 1 ) {
			adoptValue( singleValue, primary.done( updateFunc( i ) ).resolve, primary.reject,
				!remaining );

			// Use .then() to unwrap secondary thenables (cf. gh-3000)
			if ( primary.state() === "pending" ||
				isFunction( resolveValues[ i ] && resolveValues[ i ].then ) ) {

				return primary.then();
			}
		}

		// Multiple arguments are aggregated like Promise.all array elements
		while ( i-- ) {
			adoptValue( resolveValues[ i ], updateFunc( i ), primary.reject );
		}

		return primary.promise();
	}
} );


// These usually indicate a programmer mistake during development,
// warn about them ASAP rather than swallowing them by default.
var rerrorNames = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;

jQuery.Deferred.exceptionHook = function( error, stack ) {

	// Support: IE 8 - 9 only
	// Console exists when dev tools are open, which can happen at any time
	if ( window.console && window.console.warn && error && rerrorNames.test( error.name ) ) {
		window.console.warn( "jQuery.Deferred exception: " + error.message, error.stack, stack );
	}
};




jQuery.readyException = function( error ) {
	window.setTimeout( function() {
		throw error;
	} );
};




// The deferred used on DOM ready
var readyList = jQuery.Deferred();

jQuery.fn.ready = function( fn ) {

	readyList
		.then( fn )

		// Wrap jQuery.readyException in a function so that the lookup
		// happens at the time of error handling instead of callback
		// registration.
		.catch( function( error ) {
			jQuery.readyException( error );
		} );

	return this;
};

jQuery.extend( {

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );
	}
} );

jQuery.ready.then = readyList.then;

// The ready event handler and self cleanup method
function completed() {
	document.removeEventListener( "DOMContentLoaded", completed );
	window.removeEventListener( "load", completed );
	jQuery.ready();
}

// Catch cases where $(document).ready() is called
// after the browser event has already occurred.
// Support: IE <=9 - 10 only
// Older IE sometimes signals "interactive" too soon
if ( document.readyState === "complete" ||
	( document.readyState !== "loading" && !document.documentElement.doScroll ) ) {

	// Handle it asynchronously to allow scripts the opportunity to delay ready
	window.setTimeout( jQuery.ready );

} else {

	// Use the handy event callback
	document.addEventListener( "DOMContentLoaded", completed );

	// A fallback to window.onload, that will always work
	window.addEventListener( "load", completed );
}




// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		len = elems.length,
		bulk = key == null;

	// Sets many values
	if ( toType( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			access( elems, fn, i, key[ i ], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {

			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, _key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < len; i++ ) {
				fn(
					elems[ i ], key, raw ?
						value :
						value.call( elems[ i ], i, fn( elems[ i ], key ) )
				);
			}
		}
	}

	if ( chainable ) {
		return elems;
	}

	// Gets
	if ( bulk ) {
		return fn.call( elems );
	}

	return len ? fn( elems[ 0 ], key ) : emptyGet;
};


// Matches dashed string for camelizing
var rmsPrefix = /^-ms-/,
	rdashAlpha = /-([a-z])/g;

// Used by camelCase as callback to replace()
function fcamelCase( _all, letter ) {
	return letter.toUpperCase();
}

// Convert dashed to camelCase; used by the css and data modules
// Support: IE <=9 - 11, Edge 12 - 15
// Microsoft forgot to hump their vendor prefix (#9572)
function camelCase( string ) {
	return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
}
var acceptData = function( owner ) {

	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
};




function Data() {
	this.expando = jQuery.expando + Data.uid++;
}

Data.uid = 1;

Data.prototype = {

	cache: function( owner ) {

		// Check if the owner object already has a cache
		var value = owner[ this.expando ];

		// If not, create one
		if ( !value ) {
			value = {};

			// We can accept data for non-element nodes in modern browsers,
			// but we should not, see #8335.
			// Always return an empty object.
			if ( acceptData( owner ) ) {

				// If it is a node unlikely to be stringify-ed or looped over
				// use plain assignment
				if ( owner.nodeType ) {
					owner[ this.expando ] = value;

				// Otherwise secure it in a non-enumerable property
				// configurable must be true to allow the property to be
				// deleted when data is removed
				} else {
					Object.defineProperty( owner, this.expando, {
						value: value,
						configurable: true
					} );
				}
			}
		}

		return value;
	},
	set: function( owner, data, value ) {
		var prop,
			cache = this.cache( owner );

		// Handle: [ owner, key, value ] args
		// Always use camelCase key (gh-2257)
		if ( typeof data === "string" ) {
			cache[ camelCase( data ) ] = value;

		// Handle: [ owner, { properties } ] args
		} else {

			// Copy the properties one-by-one to the cache object
			for ( prop in data ) {
				cache[ camelCase( prop ) ] = data[ prop ];
			}
		}
		return cache;
	},
	get: function( owner, key ) {
		return key === undefined ?
			this.cache( owner ) :

			// Always use camelCase key (gh-2257)
			owner[ this.expando ] && owner[ this.expando ][ camelCase( key ) ];
	},
	access: function( owner, key, value ) {

		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				( ( key && typeof key === "string" ) && value === undefined ) ) {

			return this.get( owner, key );
		}

		// When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i,
			cache = owner[ this.expando ];

		if ( cache === undefined ) {
			return;
		}

		if ( key !== undefined ) {

			// Support array or space separated string of keys
			if ( Array.isArray( key ) ) {

				// If key is an array of keys...
				// We always set camelCase keys, so remove that.
				key = key.map( camelCase );
			} else {
				key = camelCase( key );

				// If a key with the spaces exists, use it.
				// Otherwise, create an array by matching non-whitespace
				key = key in cache ?
					[ key ] :
					( key.match( rnothtmlwhite ) || [] );
			}

			i = key.length;

			while ( i-- ) {
				delete cache[ key[ i ] ];
			}
		}

		// Remove the expando if there's no more data
		if ( key === undefined || jQuery.isEmptyObject( cache ) ) {

			// Support: Chrome <=35 - 45
			// Webkit & Blink performance suffers when deleting properties
			// from DOM nodes, so set to undefined instead
			// https://bugs.chromium.org/p/chromium/issues/detail?id=378607 (bug restricted)
			if ( owner.nodeType ) {
				owner[ this.expando ] = undefined;
			} else {
				delete owner[ this.expando ];
			}
		}
	},
	hasData: function( owner ) {
		var cache = owner[ this.expando ];
		return cache !== undefined && !jQuery.isEmptyObject( cache );
	}
};
var dataPriv = new Data();

var dataUser = new Data();



//	Implementation Summary
//
//	1. Enforce API surface and semantic compatibility with 1.9.x branch
//	2. Improve the module's maintainability by reducing the storage
//		paths to a single mechanism.
//	3. Use the same single mechanism to support "private" and "user" data.
//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
//	5. Avoid exposing implementation details on user objects (eg. expando properties)
//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /[A-Z]/g;

function getData( data ) {
	if ( data === "true" ) {
		return true;
	}

	if ( data === "false" ) {
		return false;
	}

	if ( data === "null" ) {
		return null;
	}

	// Only convert to a number if it doesn't change the string
	if ( data === +data + "" ) {
		return +data;
	}

	if ( rbrace.test( data ) ) {
		return JSON.parse( data );
	}

	return data;
}

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$&" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = getData( data );
			} catch ( e ) {}

			// Make sure we set the data so it isn't changed later
			dataUser.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}

jQuery.extend( {
	hasData: function( elem ) {
		return dataUser.hasData( elem ) || dataPriv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return dataUser.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		dataUser.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to dataPriv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return dataPriv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		dataPriv.remove( elem, name );
	}
} );

jQuery.fn.extend( {
	data: function( key, value ) {
		var i, name, data,
			elem = this[ 0 ],
			attrs = elem && elem.attributes;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = dataUser.get( elem );

				if ( elem.nodeType === 1 && !dataPriv.get( elem, "hasDataAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE 11 only
						// The attrs elements can be null (#14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = camelCase( name.slice( 5 ) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					dataPriv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each( function() {
				dataUser.set( this, key );
			} );
		}

		return access( this, function( value ) {
			var data;

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {

				// Attempt to get data from the cache
				// The key will always be camelCased in Data
				data = dataUser.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each( function() {

				// We always store the camelCased key
				dataUser.set( this, key, value );
			} );
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each( function() {
			dataUser.remove( this, key );
		} );
	}
} );


jQuery.extend( {
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = dataPriv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || Array.isArray( data ) ) {
					queue = dataPriv.access( elem, type, jQuery.makeArray( data ) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// Clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// Not public - generate a queueHooks object, or return the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return dataPriv.get( elem, key ) || dataPriv.access( elem, key, {
			empty: jQuery.Callbacks( "once memory" ).add( function() {
				dataPriv.remove( elem, [ type + "queue", key ] );
			} )
		} );
	}
} );

jQuery.fn.extend( {
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[ 0 ], type );
		}

		return data === undefined ?
			this :
			this.each( function() {
				var queue = jQuery.queue( this, type, data );

				// Ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[ 0 ] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			} );
	},
	dequeue: function( type ) {
		return this.each( function() {
			jQuery.dequeue( this, type );
		} );
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},

	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = dataPriv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
} );
var pnum = ( /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/ ).source;

var rcssNum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" );


var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var documentElement = document.documentElement;



	var isAttached = function( elem ) {
			return jQuery.contains( elem.ownerDocument, elem );
		},
		composed = { composed: true };

	// Support: IE 9 - 11+, Edge 12 - 18+, iOS 10.0 - 10.2 only
	// Check attachment across shadow DOM boundaries when possible (gh-3504)
	// Support: iOS 10.0-10.2 only
	// Early iOS 10 versions support `attachShadow` but not `getRootNode`,
	// leading to errors. We need to check for `getRootNode`.
	if ( documentElement.getRootNode ) {
		isAttached = function( elem ) {
			return jQuery.contains( elem.ownerDocument, elem ) ||
				elem.getRootNode( composed ) === elem.ownerDocument;
		};
	}
var isHiddenWithinTree = function( elem, el ) {

		// isHiddenWithinTree might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;

		// Inline style trumps all
		return elem.style.display === "none" ||
			elem.style.display === "" &&

			// Otherwise, check computed style
			// Support: Firefox <=43 - 45
			// Disconnected elements can have computed display: none, so first confirm that elem is
			// in the document.
			isAttached( elem ) &&

			jQuery.css( elem, "display" ) === "none";
	};



function adjustCSS( elem, prop, valueParts, tween ) {
	var adjusted, scale,
		maxIterations = 20,
		currentValue = tween ?
			function() {
				return tween.cur();
			} :
			function() {
				return jQuery.css( elem, prop, "" );
			},
		initial = currentValue(),
		unit = valueParts && valueParts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

		// Starting value computation is required for potential unit mismatches
		initialInUnit = elem.nodeType &&
			( jQuery.cssNumber[ prop ] || unit !== "px" && +initial ) &&
			rcssNum.exec( jQuery.css( elem, prop ) );

	if ( initialInUnit && initialInUnit[ 3 ] !== unit ) {

		// Support: Firefox <=54
		// Halve the iteration target value to prevent interference from CSS upper bounds (gh-2144)
		initial = initial / 2;

		// Trust units reported by jQuery.css
		unit = unit || initialInUnit[ 3 ];

		// Iteratively approximate from a nonzero starting point
		initialInUnit = +initial || 1;

		while ( maxIterations-- ) {

			// Evaluate and update our best guess (doubling guesses that zero out).
			// Finish if the scale equals or crosses 1 (making the old*new product non-positive).
			jQuery.style( elem, prop, initialInUnit + unit );
			if ( ( 1 - scale ) * ( 1 - ( scale = currentValue() / initial || 0.5 ) ) <= 0 ) {
				maxIterations = 0;
			}
			initialInUnit = initialInUnit / scale;

		}

		initialInUnit = initialInUnit * 2;
		jQuery.style( elem, prop, initialInUnit + unit );

		// Make sure we update the tween properties later on
		valueParts = valueParts || [];
	}

	if ( valueParts ) {
		initialInUnit = +initialInUnit || +initial || 0;

		// Apply relative offset (+=/-=) if specified
		adjusted = valueParts[ 1 ] ?
			initialInUnit + ( valueParts[ 1 ] + 1 ) * valueParts[ 2 ] :
			+valueParts[ 2 ];
		if ( tween ) {
			tween.unit = unit;
			tween.start = initialInUnit;
			tween.end = adjusted;
		}
	}
	return adjusted;
}


var defaultDisplayMap = {};

function getDefaultDisplay( elem ) {
	var temp,
		doc = elem.ownerDocument,
		nodeName = elem.nodeName,
		display = defaultDisplayMap[ nodeName ];

	if ( display ) {
		return display;
	}

	temp = doc.body.appendChild( doc.createElement( nodeName ) );
	display = jQuery.css( temp, "display" );

	temp.parentNode.removeChild( temp );

	if ( display === "none" ) {
		display = "block";
	}
	defaultDisplayMap[ nodeName ] = display;

	return display;
}

function showHide( elements, show ) {
	var display, elem,
		values = [],
		index = 0,
		length = elements.length;

	// Determine new display value for elements that need to change
	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		display = elem.style.display;
		if ( show ) {

			// Since we force visibility upon cascade-hidden elements, an immediate (and slow)
			// check is required in this first loop unless we have a nonempty display value (either
			// inline or about-to-be-restored)
			if ( display === "none" ) {
				values[ index ] = dataPriv.get( elem, "display" ) || null;
				if ( !values[ index ] ) {
					elem.style.display = "";
				}
			}
			if ( elem.style.display === "" && isHiddenWithinTree( elem ) ) {
				values[ index ] = getDefaultDisplay( elem );
			}
		} else {
			if ( display !== "none" ) {
				values[ index ] = "none";

				// Remember what we're overwriting
				dataPriv.set( elem, "display", display );
			}
		}
	}

	// Set the display of the elements in a second loop to avoid constant reflow
	for ( index = 0; index < length; index++ ) {
		if ( values[ index ] != null ) {
			elements[ index ].style.display = values[ index ];
		}
	}

	return elements;
}

jQuery.fn.extend( {
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each( function() {
			if ( isHiddenWithinTree( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		} );
	}
} );
var rcheckableType = ( /^(?:checkbox|radio)$/i );

var rtagName = ( /<([a-z][^\/\0>\x20\t\r\n\f]*)/i );

var rscriptType = ( /^$|^module$|\/(?:java|ecma)script/i );



( function() {
	var fragment = document.createDocumentFragment(),
		div = fragment.appendChild( document.createElement( "div" ) ),
		input = document.createElement( "input" );

	// Support: Android 4.0 - 4.3 only
	// Check state lost if the name is set (#11217)
	// Support: Windows Web Apps (WWA)
	// `name` and `type` must use .setAttribute for WWA (#14901)
	input.setAttribute( "type", "radio" );
	input.setAttribute( "checked", "checked" );
	input.setAttribute( "name", "t" );

	div.appendChild( input );

	// Support: Android <=4.1 only
	// Older WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE <=11 only
	// Make sure textarea (and checkbox) defaultValue is properly cloned
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;

	// Support: IE <=9 only
	// IE <=9 replaces <option> tags with their contents when inserted outside of
	// the select element.
	div.innerHTML = "<option></option>";
	support.option = !!div.lastChild;
} )();


// We have to close these tags to support XHTML (#13200)
var wrapMap = {

	// XHTML parsers do not magically insert elements in the
	// same way that tag soup parsers do. So we cannot shorten
	// this by omitting <tbody> or other required elements.
	thead: [ 1, "<table>", "</table>" ],
	col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
	tr: [ 2, "<table><tbody>", "</tbody></table>" ],
	td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

	_default: [ 0, "", "" ]
};

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// Support: IE <=9 only
if ( !support.option ) {
	wrapMap.optgroup = wrapMap.option = [ 1, "<select multiple='multiple'>", "</select>" ];
}


function getAll( context, tag ) {

	// Support: IE <=9 - 11 only
	// Use typeof to avoid zero-argument method invocation on host objects (#15151)
	var ret;

	if ( typeof context.getElementsByTagName !== "undefined" ) {
		ret = context.getElementsByTagName( tag || "*" );

	} else if ( typeof context.querySelectorAll !== "undefined" ) {
		ret = context.querySelectorAll( tag || "*" );

	} else {
		ret = [];
	}

	if ( tag === undefined || tag && nodeName( context, tag ) ) {
		return jQuery.merge( [ context ], ret );
	}

	return ret;
}


// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		dataPriv.set(
			elems[ i ],
			"globalEval",
			!refElements || dataPriv.get( refElements[ i ], "globalEval" )
		);
	}
}


var rhtml = /<|&#?\w+;/;

function buildFragment( elems, context, scripts, selection, ignored ) {
	var elem, tmp, tag, wrap, attached, j,
		fragment = context.createDocumentFragment(),
		nodes = [],
		i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		elem = elems[ i ];

		if ( elem || elem === 0 ) {

			// Add nodes directly
			if ( toType( elem ) === "object" ) {

				// Support: Android <=4.0 only, PhantomJS 1 only
				// push.apply(_, arraylike) throws on ancient WebKit
				jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

			// Convert non-html into a text node
			} else if ( !rhtml.test( elem ) ) {
				nodes.push( context.createTextNode( elem ) );

			// Convert html into DOM nodes
			} else {
				tmp = tmp || fragment.appendChild( context.createElement( "div" ) );

				// Deserialize a standard representation
				tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
				wrap = wrapMap[ tag ] || wrapMap._default;
				tmp.innerHTML = wrap[ 1 ] + jQuery.htmlPrefilter( elem ) + wrap[ 2 ];

				// Descend through wrappers to the right content
				j = wrap[ 0 ];
				while ( j-- ) {
					tmp = tmp.lastChild;
				}

				// Support: Android <=4.0 only, PhantomJS 1 only
				// push.apply(_, arraylike) throws on ancient WebKit
				jQuery.merge( nodes, tmp.childNodes );

				// Remember the top-level container
				tmp = fragment.firstChild;

				// Ensure the created nodes are orphaned (#12392)
				tmp.textContent = "";
			}
		}
	}

	// Remove wrapper from fragment
	fragment.textContent = "";

	i = 0;
	while ( ( elem = nodes[ i++ ] ) ) {

		// Skip elements already in the context collection (trac-4087)
		if ( selection && jQuery.inArray( elem, selection ) > -1 ) {
			if ( ignored ) {
				ignored.push( elem );
			}
			continue;
		}

		attached = isAttached( elem );

		// Append to fragment
		tmp = getAll( fragment.appendChild( elem ), "script" );

		// Preserve script evaluation history
		if ( attached ) {
			setGlobalEval( tmp );
		}

		// Capture executables
		if ( scripts ) {
			j = 0;
			while ( ( elem = tmp[ j++ ] ) ) {
				if ( rscriptType.test( elem.type || "" ) ) {
					scripts.push( elem );
				}
			}
		}
	}

	return fragment;
}


var rtypenamespace = /^([^.]*)(?:\.(.+)|)/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

// Support: IE <=9 - 11+
// focus() and blur() are asynchronous, except when they are no-op.
// So expect focus to be synchronous when the element is already active,
// and blur to be synchronous when the element is not already active.
// (focus and blur are always synchronous in other supported browsers,
// this just defines when we can count on it).
function expectSync( elem, type ) {
	return ( elem === safeActiveElement() ) === ( type === "focus" );
}

// Support: IE <=9 only
// Accessing document.activeElement can throw unexpectedly
// https://bugs.jquery.com/ticket/13393
function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

function on( elem, types, selector, data, fn, one ) {
	var origFn, type;

	// Types can be a map of types/handlers
	if ( typeof types === "object" ) {

		// ( types-Object, selector, data )
		if ( typeof selector !== "string" ) {

			// ( types-Object, data )
			data = data || selector;
			selector = undefined;
		}
		for ( type in types ) {
			on( elem, type, selector, data, types[ type ], one );
		}
		return elem;
	}

	if ( data == null && fn == null ) {

		// ( types, fn )
		fn = selector;
		data = selector = undefined;
	} else if ( fn == null ) {
		if ( typeof selector === "string" ) {

			// ( types, selector, fn )
			fn = data;
			data = undefined;
		} else {

			// ( types, data, fn )
			fn = data;
			data = selector;
			selector = undefined;
		}
	}
	if ( fn === false ) {
		fn = returnFalse;
	} else if ( !fn ) {
		return elem;
	}

	if ( one === 1 ) {
		origFn = fn;
		fn = function( event ) {

			// Can use an empty set, since event contains the info
			jQuery().off( event );
			return origFn.apply( this, arguments );
		};

		// Use same guid so caller can remove using origFn
		fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
	}
	return elem.each( function() {
		jQuery.event.add( this, types, fn, data, selector );
	} );
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.get( elem );

		// Only attach events to objects that accept data
		if ( !acceptData( elem ) ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Ensure that invalid selectors throw exceptions at attach time
		// Evaluate against documentElement in case elem is a non-element node (e.g., document)
		if ( selector ) {
			jQuery.find.matchesSelector( documentElement, selector );
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !( events = elemData.events ) ) {
			events = elemData.events = Object.create( null );
		}
		if ( !( eventHandle = elemData.handle ) ) {
			eventHandle = elemData.handle = function( e ) {

				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== "undefined" && jQuery.event.triggered !== e.type ?
					jQuery.event.dispatch.apply( elem, arguments ) : undefined;
			};
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend( {
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join( "." )
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !( handlers = events[ type ] ) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup ||
					special.setup.call( elem, data, namespaces, eventHandle ) === false ) {

					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.hasData( elem ) && dataPriv.get( elem );

		if ( !elemData || !( events = elemData.events ) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[ 2 ] &&
				new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector ||
						selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown ||
					special.teardown.call( elem, namespaces, elemData.handle ) === false ) {

					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove data and the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			dataPriv.remove( elem, "handle events" );
		}
	},

	dispatch: function( nativeEvent ) {

		var i, j, ret, matched, handleObj, handlerQueue,
			args = new Array( arguments.length ),

			// Make a writable jQuery.Event from the native event object
			event = jQuery.event.fix( nativeEvent ),

			handlers = (
				dataPriv.get( this, "events" ) || Object.create( null )
			)[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[ 0 ] = event;

		for ( i = 1; i < arguments.length; i++ ) {
			args[ i ] = arguments[ i ];
		}

		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( ( matched = handlerQueue[ i++ ] ) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( ( handleObj = matched.handlers[ j++ ] ) &&
				!event.isImmediatePropagationStopped() ) {

				// If the event is namespaced, then each handler is only invoked if it is
				// specially universal or its namespaces are a superset of the event's.
				if ( !event.rnamespace || handleObj.namespace === false ||
					event.rnamespace.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( ( jQuery.event.special[ handleObj.origType ] || {} ).handle ||
						handleObj.handler ).apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( ( event.result = ret ) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, handleObj, sel, matchedHandlers, matchedSelectors,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		if ( delegateCount &&

			// Support: IE <=9
			// Black-hole SVG <use> instance trees (trac-13180)
			cur.nodeType &&

			// Support: Firefox <=42
			// Suppress spec-violating clicks indicating a non-primary pointer button (trac-3861)
			// https://www.w3.org/TR/DOM-Level-3-Events/#event-type-click
			// Support: IE 11 only
			// ...but not arrow key "clicks" of radio inputs, which can have `button` -1 (gh-2343)
			!( event.type === "click" && event.button >= 1 ) ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't check non-elements (#13208)
				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.nodeType === 1 && !( event.type === "click" && cur.disabled === true ) ) {
					matchedHandlers = [];
					matchedSelectors = {};
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matchedSelectors[ sel ] === undefined ) {
							matchedSelectors[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) > -1 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matchedSelectors[ sel ] ) {
							matchedHandlers.push( handleObj );
						}
					}
					if ( matchedHandlers.length ) {
						handlerQueue.push( { elem: cur, handlers: matchedHandlers } );
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		cur = this;
		if ( delegateCount < handlers.length ) {
			handlerQueue.push( { elem: cur, handlers: handlers.slice( delegateCount ) } );
		}

		return handlerQueue;
	},

	addProp: function( name, hook ) {
		Object.defineProperty( jQuery.Event.prototype, name, {
			enumerable: true,
			configurable: true,

			get: isFunction( hook ) ?
				function() {
					if ( this.originalEvent ) {
						return hook( this.originalEvent );
					}
				} :
				function() {
					if ( this.originalEvent ) {
						return this.originalEvent[ name ];
					}
				},

			set: function( value ) {
				Object.defineProperty( this, name, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: value
				} );
			}
		} );
	},

	fix: function( originalEvent ) {
		return originalEvent[ jQuery.expando ] ?
			originalEvent :
			new jQuery.Event( originalEvent );
	},

	special: {
		load: {

			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		click: {

			// Utilize native event to ensure correct state for checkable inputs
			setup: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Claim the first handler
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					// dataPriv.set( el, "click", ... )
					leverageNative( el, "click", returnTrue );
				}

				// Return false to allow normal processing in the caller
				return false;
			},
			trigger: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Force setup before triggering a click
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					leverageNative( el, "click" );
				}

				// Return non-false to allow normal event-path propagation
				return true;
			},

			// For cross-browser consistency, suppress native .click() on links
			// Also prevent it if we're currently inside a leveraged native-event stack
			_default: function( event ) {
				var target = event.target;
				return rcheckableType.test( target.type ) &&
					target.click && nodeName( target, "input" ) &&
					dataPriv.get( target, "click" ) ||
					nodeName( target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	}
};

// Ensure the presence of an event listener that handles manually-triggered
// synthetic events by interrupting progress until reinvoked in response to
// *native* events that it fires directly, ensuring that state changes have
// already occurred before other listeners are invoked.
function leverageNative( el, type, expectSync ) {

	// Missing expectSync indicates a trigger call, which must force setup through jQuery.event.add
	if ( !expectSync ) {
		if ( dataPriv.get( el, type ) === undefined ) {
			jQuery.event.add( el, type, returnTrue );
		}
		return;
	}

	// Register the controller as a special universal handler for all event namespaces
	dataPriv.set( el, type, false );
	jQuery.event.add( el, type, {
		namespace: false,
		handler: function( event ) {
			var notAsync, result,
				saved = dataPriv.get( this, type );

			if ( ( event.isTrigger & 1 ) && this[ type ] ) {

				// Interrupt processing of the outer synthetic .trigger()ed event
				// Saved data should be false in such cases, but might be a leftover capture object
				// from an async native handler (gh-4350)
				if ( !saved.length ) {

					// Store arguments for use when handling the inner native event
					// There will always be at least one argument (an event object), so this array
					// will not be confused with a leftover capture object.
					saved = slice.call( arguments );
					dataPriv.set( this, type, saved );

					// Trigger the native event and capture its result
					// Support: IE <=9 - 11+
					// focus() and blur() are asynchronous
					notAsync = expectSync( this, type );
					this[ type ]();
					result = dataPriv.get( this, type );
					if ( saved !== result || notAsync ) {
						dataPriv.set( this, type, false );
					} else {
						result = {};
					}
					if ( saved !== result ) {

						// Cancel the outer synthetic event
						event.stopImmediatePropagation();
						event.preventDefault();

						// Support: Chrome 86+
						// In Chrome, if an element having a focusout handler is blurred by
						// clicking outside of it, it invokes the handler synchronously. If
						// that handler calls `.remove()` on the element, the data is cleared,
						// leaving `result` undefined. We need to guard against this.
						return result && result.value;
					}

				// If this is an inner synthetic event for an event with a bubbling surrogate
				// (focus or blur), assume that the surrogate already propagated from triggering the
				// native event and prevent that from happening again here.
				// This technically gets the ordering wrong w.r.t. to `.trigger()` (in which the
				// bubbling surrogate propagates *after* the non-bubbling base), but that seems
				// less bad than duplication.
				} else if ( ( jQuery.event.special[ type ] || {} ).delegateType ) {
					event.stopPropagation();
				}

			// If this is a native event triggered above, everything is now in order
			// Fire an inner synthetic event with the original arguments
			} else if ( saved.length ) {

				// ...and capture the result
				dataPriv.set( this, type, {
					value: jQuery.event.trigger(

						// Support: IE <=9 - 11+
						// Extend with the prototype to reset the above stopImmediatePropagation()
						jQuery.extend( saved[ 0 ], jQuery.Event.prototype ),
						saved.slice( 1 ),
						this
					)
				} );

				// Abort handling of the native event
				event.stopImmediatePropagation();
			}
		}
	} );
}

jQuery.removeEvent = function( elem, type, handle ) {

	// This "if" is needed for plain objects
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle );
	}
};

jQuery.Event = function( src, props ) {

	// Allow instantiation without the 'new' keyword
	if ( !( this instanceof jQuery.Event ) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined &&

				// Support: Android <=2.3 only
				src.returnValue === false ?
			returnTrue :
			returnFalse;

		// Create target properties
		// Support: Safari <=6 - 7 only
		// Target should not be a text node (#504, #13143)
		this.target = ( src.target && src.target.nodeType === 3 ) ?
			src.target.parentNode :
			src.target;

		this.currentTarget = src.currentTarget;
		this.relatedTarget = src.relatedTarget;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || Date.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// https://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	constructor: jQuery.Event,
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,
	isSimulated: false,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && !this.isSimulated ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Includes all common event props including KeyEvent and MouseEvent specific props
jQuery.each( {
	altKey: true,
	bubbles: true,
	cancelable: true,
	changedTouches: true,
	ctrlKey: true,
	detail: true,
	eventPhase: true,
	metaKey: true,
	pageX: true,
	pageY: true,
	shiftKey: true,
	view: true,
	"char": true,
	code: true,
	charCode: true,
	key: true,
	keyCode: true,
	button: true,
	buttons: true,
	clientX: true,
	clientY: true,
	offsetX: true,
	offsetY: true,
	pointerId: true,
	pointerType: true,
	screenX: true,
	screenY: true,
	targetTouches: true,
	toElement: true,
	touches: true,
	which: true
}, jQuery.event.addProp );

jQuery.each( { focus: "focusin", blur: "focusout" }, function( type, delegateType ) {
	jQuery.event.special[ type ] = {

		// Utilize native event if possible so blur/focus sequence is correct
		setup: function() {

			// Claim the first handler
			// dataPriv.set( this, "focus", ... )
			// dataPriv.set( this, "blur", ... )
			leverageNative( this, type, expectSync );

			// Return false to allow normal processing in the caller
			return false;
		},
		trigger: function() {

			// Force setup before trigger
			leverageNative( this, type );

			// Return non-false to allow normal event-path propagation
			return true;
		},

		// Suppress native focus or blur as it's already being fired
		// in leverageNative.
		_default: function() {
			return true;
		},

		delegateType: delegateType
	};
} );

// Create mouseenter/leave events using mouseover/out and event-time checks
// so that event delegation works in jQuery.
// Do the same for pointerenter/pointerleave and pointerover/pointerout
//
// Support: Safari 7 only
// Safari sends mouseenter too often; see:
// https://bugs.chromium.org/p/chromium/issues/detail?id=470258
// for the description of the bug (it existed in older Chrome versions as well).
jQuery.each( {
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mouseenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || ( related !== target && !jQuery.contains( target, related ) ) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
} );

jQuery.fn.extend( {

	on: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn );
	},
	one: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {

			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ?
					handleObj.origType + "." + handleObj.namespace :
					handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {

			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {

			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each( function() {
			jQuery.event.remove( this, types, fn, selector );
		} );
	}
} );


var

	// Support: IE <=10 - 11, Edge 12 - 13 only
	// In IE/Edge using regex groups here causes severe slowdowns.
	// See https://connect.microsoft.com/IE/feedback/details/1736512/
	rnoInnerhtml = /<script|<style|<link/i,

	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;

// Prefer a tbody over its parent table for containing new rows
function manipulationTarget( elem, content ) {
	if ( nodeName( elem, "table" ) &&
		nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ) {

		return jQuery( elem ).children( "tbody" )[ 0 ] || elem;
	}

	return elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = ( elem.getAttribute( "type" ) !== null ) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	if ( ( elem.type || "" ).slice( 0, 5 ) === "true/" ) {
		elem.type = elem.type.slice( 5 );
	} else {
		elem.removeAttribute( "type" );
	}

	return elem;
}

function cloneCopyEvent( src, dest ) {
	var i, l, type, pdataOld, udataOld, udataCur, events;

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( dataPriv.hasData( src ) ) {
		pdataOld = dataPriv.get( src );
		events = pdataOld.events;

		if ( events ) {
			dataPriv.remove( dest, "handle events" );

			for ( type in events ) {
				for ( i = 0, l = events[ type ].length; i < l; i++ ) {
					jQuery.event.add( dest, type, events[ type ][ i ] );
				}
			}
		}
	}

	// 2. Copy user data
	if ( dataUser.hasData( src ) ) {
		udataOld = dataUser.access( src );
		udataCur = jQuery.extend( {}, udataOld );

		dataUser.set( dest, udataCur );
	}
}

// Fix IE bugs, see support tests
function fixInput( src, dest ) {
	var nodeName = dest.nodeName.toLowerCase();

	// Fails to persist the checked state of a cloned checkbox or radio button.
	if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		dest.checked = src.checked;

	// Fails to return the selected option to the default selected state when cloning options
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

function domManip( collection, args, callback, ignored ) {

	// Flatten any nested arrays
	args = flat( args );

	var fragment, first, scripts, hasScripts, node, doc,
		i = 0,
		l = collection.length,
		iNoClone = l - 1,
		value = args[ 0 ],
		valueIsFunction = isFunction( value );

	// We can't cloneNode fragments that contain checked, in WebKit
	if ( valueIsFunction ||
			( l > 1 && typeof value === "string" &&
				!support.checkClone && rchecked.test( value ) ) ) {
		return collection.each( function( index ) {
			var self = collection.eq( index );
			if ( valueIsFunction ) {
				args[ 0 ] = value.call( this, index, self.html() );
			}
			domManip( self, args, callback, ignored );
		} );
	}

	if ( l ) {
		fragment = buildFragment( args, collection[ 0 ].ownerDocument, false, collection, ignored );
		first = fragment.firstChild;

		if ( fragment.childNodes.length === 1 ) {
			fragment = first;
		}

		// Require either new content or an interest in ignored elements to invoke the callback
		if ( first || ignored ) {
			scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
			hasScripts = scripts.length;

			// Use the original fragment for the last item
			// instead of the first because it can end up
			// being emptied incorrectly in certain situations (#8070).
			for ( ; i < l; i++ ) {
				node = fragment;

				if ( i !== iNoClone ) {
					node = jQuery.clone( node, true, true );

					// Keep references to cloned scripts for later restoration
					if ( hasScripts ) {

						// Support: Android <=4.0 only, PhantomJS 1 only
						// push.apply(_, arraylike) throws on ancient WebKit
						jQuery.merge( scripts, getAll( node, "script" ) );
					}
				}

				callback.call( collection[ i ], node, i );
			}

			if ( hasScripts ) {
				doc = scripts[ scripts.length - 1 ].ownerDocument;

				// Reenable scripts
				jQuery.map( scripts, restoreScript );

				// Evaluate executable scripts on first document insertion
				for ( i = 0; i < hasScripts; i++ ) {
					node = scripts[ i ];
					if ( rscriptType.test( node.type || "" ) &&
						!dataPriv.access( node, "globalEval" ) &&
						jQuery.contains( doc, node ) ) {

						if ( node.src && ( node.type || "" ).toLowerCase()  !== "module" ) {

							// Optional AJAX dependency, but won't run scripts if not present
							if ( jQuery._evalUrl && !node.noModule ) {
								jQuery._evalUrl( node.src, {
									nonce: node.nonce || node.getAttribute( "nonce" )
								}, doc );
							}
						} else {
							DOMEval( node.textContent.replace( rcleanScript, "" ), node, doc );
						}
					}
				}
			}
		}
	}

	return collection;
}

function remove( elem, selector, keepData ) {
	var node,
		nodes = selector ? jQuery.filter( selector, elem ) : elem,
		i = 0;

	for ( ; ( node = nodes[ i ] ) != null; i++ ) {
		if ( !keepData && node.nodeType === 1 ) {
			jQuery.cleanData( getAll( node ) );
		}

		if ( node.parentNode ) {
			if ( keepData && isAttached( node ) ) {
				setGlobalEval( getAll( node, "script" ) );
			}
			node.parentNode.removeChild( node );
		}
	}

	return elem;
}

jQuery.extend( {
	htmlPrefilter: function( html ) {
		return html;
	},

	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = isAttached( elem );

		// Fix IE cloning issues
		if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
				!jQuery.isXMLDoc( elem ) ) {

			// We eschew Sizzle here for performance reasons: https://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {
				fixInput( srcElements[ i ], destElements[ i ] );
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	cleanData: function( elems ) {
		var data, elem, type,
			special = jQuery.event.special,
			i = 0;

		for ( ; ( elem = elems[ i ] ) !== undefined; i++ ) {
			if ( acceptData( elem ) ) {
				if ( ( data = elem[ dataPriv.expando ] ) ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataPriv.expando ] = undefined;
				}
				if ( elem[ dataUser.expando ] ) {

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataUser.expando ] = undefined;
				}
			}
		}
	}
} );

jQuery.fn.extend( {
	detach: function( selector ) {
		return remove( this, selector, true );
	},

	remove: function( selector ) {
		return remove( this, selector );
	},

	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each( function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				} );
		}, null, value, arguments.length );
	},

	append: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		} );
	},

	prepend: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		} );
	},

	before: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		} );
	},

	after: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		} );
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; ( elem = this[ i ] ) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		} );
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = jQuery.htmlPrefilter( value );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch ( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var ignored = [];

		// Make the changes, replacing each non-ignored context element with the new content
		return domManip( this, arguments, function( elem ) {
			var parent = this.parentNode;

			if ( jQuery.inArray( this, ignored ) < 0 ) {
				jQuery.cleanData( getAll( this ) );
				if ( parent ) {
					parent.replaceChild( elem, this );
				}
			}

		// Force callback invocation
		}, ignored );
	}
} );

jQuery.each( {
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );

			// Support: Android <=4.0 only, PhantomJS 1 only
			// .get() because push.apply(_, arraylike) throws on ancient WebKit
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
} );
var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

var getStyles = function( elem ) {

		// Support: IE <=11 only, Firefox <=30 (#15098, #14150)
		// IE throws on elements created in popups
		// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
		var view = elem.ownerDocument.defaultView;

		if ( !view || !view.opener ) {
			view = window;
		}

		return view.getComputedStyle( elem );
	};

var swap = function( elem, options, callback ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.call( elem );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};


var rboxStyle = new RegExp( cssExpand.join( "|" ), "i" );



( function() {

	// Executing both pixelPosition & boxSizingReliable tests require only one layout
	// so they're executed at the same time to save the second computation.
	function computeStyleTests() {

		// This is a singleton, we need to execute it only once
		if ( !div ) {
			return;
		}

		container.style.cssText = "position:absolute;left:-11111px;width:60px;" +
			"margin-top:1px;padding:0;border:0";
		div.style.cssText =
			"position:relative;display:block;box-sizing:border-box;overflow:scroll;" +
			"margin:auto;border:1px;padding:1px;" +
			"width:60%;top:1%";
		documentElement.appendChild( container ).appendChild( div );

		var divStyle = window.getComputedStyle( div );
		pixelPositionVal = divStyle.top !== "1%";

		// Support: Android 4.0 - 4.3 only, Firefox <=3 - 44
		reliableMarginLeftVal = roundPixelMeasures( divStyle.marginLeft ) === 12;

		// Support: Android 4.0 - 4.3 only, Safari <=9.1 - 10.1, iOS <=7.0 - 9.3
		// Some styles come back with percentage values, even though they shouldn't
		div.style.right = "60%";
		pixelBoxStylesVal = roundPixelMeasures( divStyle.right ) === 36;

		// Support: IE 9 - 11 only
		// Detect misreporting of content dimensions for box-sizing:border-box elements
		boxSizingReliableVal = roundPixelMeasures( divStyle.width ) === 36;

		// Support: IE 9 only
		// Detect overflow:scroll screwiness (gh-3699)
		// Support: Chrome <=64
		// Don't get tricked when zoom affects offsetWidth (gh-4029)
		div.style.position = "absolute";
		scrollboxSizeVal = roundPixelMeasures( div.offsetWidth / 3 ) === 12;

		documentElement.removeChild( container );

		// Nullify the div so it wouldn't be stored in the memory and
		// it will also be a sign that checks already performed
		div = null;
	}

	function roundPixelMeasures( measure ) {
		return Math.round( parseFloat( measure ) );
	}

	var pixelPositionVal, boxSizingReliableVal, scrollboxSizeVal, pixelBoxStylesVal,
		reliableTrDimensionsVal, reliableMarginLeftVal,
		container = document.createElement( "div" ),
		div = document.createElement( "div" );

	// Finish early in limited (non-browser) environments
	if ( !div.style ) {
		return;
	}

	// Support: IE <=9 - 11 only
	// Style of cloned element affects source element cloned (#8908)
	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	jQuery.extend( support, {
		boxSizingReliable: function() {
			computeStyleTests();
			return boxSizingReliableVal;
		},
		pixelBoxStyles: function() {
			computeStyleTests();
			return pixelBoxStylesVal;
		},
		pixelPosition: function() {
			computeStyleTests();
			return pixelPositionVal;
		},
		reliableMarginLeft: function() {
			computeStyleTests();
			return reliableMarginLeftVal;
		},
		scrollboxSize: function() {
			computeStyleTests();
			return scrollboxSizeVal;
		},

		// Support: IE 9 - 11+, Edge 15 - 18+
		// IE/Edge misreport `getComputedStyle` of table rows with width/height
		// set in CSS while `offset*` properties report correct values.
		// Behavior in IE 9 is more subtle than in newer versions & it passes
		// some versions of this test; make sure not to make it pass there!
		//
		// Support: Firefox 70+
		// Only Firefox includes border widths
		// in computed dimensions. (gh-4529)
		reliableTrDimensions: function() {
			var table, tr, trChild, trStyle;
			if ( reliableTrDimensionsVal == null ) {
				table = document.createElement( "table" );
				tr = document.createElement( "tr" );
				trChild = document.createElement( "div" );

				table.style.cssText = "position:absolute;left:-11111px;border-collapse:separate";
				tr.style.cssText = "border:1px solid";

				// Support: Chrome 86+
				// Height set through cssText does not get applied.
				// Computed height then comes back as 0.
				tr.style.height = "1px";
				trChild.style.height = "9px";

				// Support: Android 8 Chrome 86+
				// In our bodyBackground.html iframe,
				// display for all div elements is set to "inline",
				// which causes a problem only in Android 8 Chrome 86.
				// Ensuring the div is display: block
				// gets around this issue.
				trChild.style.display = "block";

				documentElement
					.appendChild( table )
					.appendChild( tr )
					.appendChild( trChild );

				trStyle = window.getComputedStyle( tr );
				reliableTrDimensionsVal = ( parseInt( trStyle.height, 10 ) +
					parseInt( trStyle.borderTopWidth, 10 ) +
					parseInt( trStyle.borderBottomWidth, 10 ) ) === tr.offsetHeight;

				documentElement.removeChild( table );
			}
			return reliableTrDimensionsVal;
		}
	} );
} )();


function curCSS( elem, name, computed ) {
	var width, minWidth, maxWidth, ret,

		// Support: Firefox 51+
		// Retrieving style before computed somehow
		// fixes an issue with getting wrong values
		// on detached elements
		style = elem.style;

	computed = computed || getStyles( elem );

	// getPropertyValue is needed for:
	//   .css('filter') (IE 9 only, #12537)
	//   .css('--customProperty) (#3144)
	if ( computed ) {
		ret = computed.getPropertyValue( name ) || computed[ name ];

		if ( ret === "" && !isAttached( elem ) ) {
			ret = jQuery.style( elem, name );
		}

		// A tribute to the "awesome hack by Dean Edwards"
		// Android Browser returns percentage for some values,
		// but width seems to be reliably pixels.
		// This is against the CSSOM draft spec:
		// https://drafts.csswg.org/cssom/#resolved-values
		if ( !support.pixelBoxStyles() && rnumnonpx.test( ret ) && rboxStyle.test( name ) ) {

			// Remember the original values
			width = style.width;
			minWidth = style.minWidth;
			maxWidth = style.maxWidth;

			// Put in the new values to get a computed value out
			style.minWidth = style.maxWidth = style.width = ret;
			ret = computed.width;

			// Revert the changed values
			style.width = width;
			style.minWidth = minWidth;
			style.maxWidth = maxWidth;
		}
	}

	return ret !== undefined ?

		// Support: IE <=9 - 11 only
		// IE returns zIndex value as an integer.
		ret + "" :
		ret;
}


function addGetHookIf( conditionFn, hookFn ) {

	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			if ( conditionFn() ) {

				// Hook not needed (or it's not possible to use it due
				// to missing dependency), remove it.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.
			return ( this.get = hookFn ).apply( this, arguments );
		}
	};
}


var cssPrefixes = [ "Webkit", "Moz", "ms" ],
	emptyStyle = document.createElement( "div" ).style,
	vendorProps = {};

// Return a vendor-prefixed property or undefined
function vendorPropName( name ) {

	// Check for vendor prefixed names
	var capName = name[ 0 ].toUpperCase() + name.slice( 1 ),
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in emptyStyle ) {
			return name;
		}
	}
}

// Return a potentially-mapped jQuery.cssProps or vendor prefixed property
function finalPropName( name ) {
	var final = jQuery.cssProps[ name ] || vendorProps[ name ];

	if ( final ) {
		return final;
	}
	if ( name in emptyStyle ) {
		return name;
	}
	return vendorProps[ name ] = vendorPropName( name ) || name;
}


var

	// Swappable if display is none or starts with table
	// except "table", "table-cell", or "table-caption"
	// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rcustomProp = /^--/,
	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	};

function setPositiveNumber( _elem, value, subtract ) {

	// Any relative (+/-) values have already been
	// normalized at this point
	var matches = rcssNum.exec( value );
	return matches ?

		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 2 ] - ( subtract || 0 ) ) + ( matches[ 3 ] || "px" ) :
		value;
}

function boxModelAdjustment( elem, dimension, box, isBorderBox, styles, computedVal ) {
	var i = dimension === "width" ? 1 : 0,
		extra = 0,
		delta = 0;

	// Adjustment may not be necessary
	if ( box === ( isBorderBox ? "border" : "content" ) ) {
		return 0;
	}

	for ( ; i < 4; i += 2 ) {

		// Both box models exclude margin
		if ( box === "margin" ) {
			delta += jQuery.css( elem, box + cssExpand[ i ], true, styles );
		}

		// If we get here with a content-box, we're seeking "padding" or "border" or "margin"
		if ( !isBorderBox ) {

			// Add padding
			delta += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// For "border" or "margin", add border
			if ( box !== "padding" ) {
				delta += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );

			// But still keep track of it otherwise
			} else {
				extra += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}

		// If we get here with a border-box (content + padding + border), we're seeking "content" or
		// "padding" or "margin"
		} else {

			// For "content", subtract padding
			if ( box === "content" ) {
				delta -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// For "content" or "padding", subtract border
			if ( box !== "margin" ) {
				delta -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	// Account for positive content-box scroll gutter when requested by providing computedVal
	if ( !isBorderBox && computedVal >= 0 ) {

		// offsetWidth/offsetHeight is a rounded sum of content, padding, scroll gutter, and border
		// Assuming integer scroll gutter, subtract the rest and round down
		delta += Math.max( 0, Math.ceil(
			elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
			computedVal -
			delta -
			extra -
			0.5

		// If offsetWidth/offsetHeight is unknown, then we can't determine content-box scroll gutter
		// Use an explicit zero to avoid NaN (gh-3964)
		) ) || 0;
	}

	return delta;
}

function getWidthOrHeight( elem, dimension, extra ) {

	// Start with computed style
	var styles = getStyles( elem ),

		// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-4322).
		// Fake content-box until we know it's needed to know the true value.
		boxSizingNeeded = !support.boxSizingReliable() || extra,
		isBorderBox = boxSizingNeeded &&
			jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
		valueIsBorderBox = isBorderBox,

		val = curCSS( elem, dimension, styles ),
		offsetProp = "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 );

	// Support: Firefox <=54
	// Return a confounding non-pixel value or feign ignorance, as appropriate.
	if ( rnumnonpx.test( val ) ) {
		if ( !extra ) {
			return val;
		}
		val = "auto";
	}


	// Support: IE 9 - 11 only
	// Use offsetWidth/offsetHeight for when box sizing is unreliable.
	// In those cases, the computed value can be trusted to be border-box.
	if ( ( !support.boxSizingReliable() && isBorderBox ||

		// Support: IE 10 - 11+, Edge 15 - 18+
		// IE/Edge misreport `getComputedStyle` of table rows with width/height
		// set in CSS while `offset*` properties report correct values.
		// Interestingly, in some cases IE 9 doesn't suffer from this issue.
		!support.reliableTrDimensions() && nodeName( elem, "tr" ) ||

		// Fall back to offsetWidth/offsetHeight when value is "auto"
		// This happens for inline elements with no explicit setting (gh-3571)
		val === "auto" ||

		// Support: Android <=4.1 - 4.3 only
		// Also use offsetWidth/offsetHeight for misreported inline dimensions (gh-3602)
		!parseFloat( val ) && jQuery.css( elem, "display", false, styles ) === "inline" ) &&

		// Make sure the element is visible & connected
		elem.getClientRects().length ) {

		isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

		// Where available, offsetWidth/offsetHeight approximate border box dimensions.
		// Where not available (e.g., SVG), assume unreliable box-sizing and interpret the
		// retrieved value as a content box dimension.
		valueIsBorderBox = offsetProp in elem;
		if ( valueIsBorderBox ) {
			val = elem[ offsetProp ];
		}
	}

	// Normalize "" and auto
	val = parseFloat( val ) || 0;

	// Adjust for the element's box model
	return ( val +
		boxModelAdjustment(
			elem,
			dimension,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles,

			// Provide the current computed size to request scroll gutter calculation (gh-3589)
			val
		)
	) + "px";
}

jQuery.extend( {

	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {

					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"animationIterationCount": true,
		"columnCount": true,
		"fillOpacity": true,
		"flexGrow": true,
		"flexShrink": true,
		"fontWeight": true,
		"gridArea": true,
		"gridColumn": true,
		"gridColumnEnd": true,
		"gridColumnStart": true,
		"gridRow": true,
		"gridRowEnd": true,
		"gridRowStart": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {

		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = camelCase( name ),
			isCustomProp = rcustomProp.test( name ),
			style = elem.style;

		// Make sure that we're working with the right name. We don't
		// want to query the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Gets hook for the prefixed version, then unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// Convert "+=" or "-=" to relative numbers (#7345)
			if ( type === "string" && ( ret = rcssNum.exec( value ) ) && ret[ 1 ] ) {
				value = adjustCSS( elem, name, ret );

				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set (#7116)
			if ( value == null || value !== value ) {
				return;
			}

			// If a number was passed in, add the unit (except for certain CSS properties)
			// The isCustomProp check can be removed in jQuery 4.0 when we only auto-append
			// "px" to a few hardcoded values.
			if ( type === "number" && !isCustomProp ) {
				value += ret && ret[ 3 ] || ( jQuery.cssNumber[ origName ] ? "" : "px" );
			}

			// background-* props affect original clone's values
			if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !( "set" in hooks ) ||
				( value = hooks.set( elem, value, extra ) ) !== undefined ) {

				if ( isCustomProp ) {
					style.setProperty( name, value );
				} else {
					style[ name ] = value;
				}
			}

		} else {

			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks &&
				( ret = hooks.get( elem, false, extra ) ) !== undefined ) {

				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = camelCase( name ),
			isCustomProp = rcustomProp.test( name );

		// Make sure that we're working with the right name. We don't
		// want to modify the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Try prefixed name followed by the unprefixed name
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		// Convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Make numeric if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || isFinite( num ) ? num || 0 : val;
		}

		return val;
	}
} );

jQuery.each( [ "height", "width" ], function( _i, dimension ) {
	jQuery.cssHooks[ dimension ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {

				// Certain elements can have dimension info if we invisibly show them
				// but it must have a current display style that would benefit
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) &&

					// Support: Safari 8+
					// Table columns in Safari have non-zero offsetWidth & zero
					// getBoundingClientRect().width unless display is changed.
					// Support: IE <=11 only
					// Running getBoundingClientRect on a disconnected node
					// in IE throws an error.
					( !elem.getClientRects().length || !elem.getBoundingClientRect().width ) ?
					swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, dimension, extra );
					} ) :
					getWidthOrHeight( elem, dimension, extra );
			}
		},

		set: function( elem, value, extra ) {
			var matches,
				styles = getStyles( elem ),

				// Only read styles.position if the test has a chance to fail
				// to avoid forcing a reflow.
				scrollboxSizeBuggy = !support.scrollboxSize() &&
					styles.position === "absolute",

				// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-3991)
				boxSizingNeeded = scrollboxSizeBuggy || extra,
				isBorderBox = boxSizingNeeded &&
					jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
				subtract = extra ?
					boxModelAdjustment(
						elem,
						dimension,
						extra,
						isBorderBox,
						styles
					) :
					0;

			// Account for unreliable border-box dimensions by comparing offset* to computed and
			// faking a content-box to get border and padding (gh-3699)
			if ( isBorderBox && scrollboxSizeBuggy ) {
				subtract -= Math.ceil(
					elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
					parseFloat( styles[ dimension ] ) -
					boxModelAdjustment( elem, dimension, "border", false, styles ) -
					0.5
				);
			}

			// Convert to pixels if value adjustment is needed
			if ( subtract && ( matches = rcssNum.exec( value ) ) &&
				( matches[ 3 ] || "px" ) !== "px" ) {

				elem.style[ dimension ] = value;
				value = jQuery.css( elem, dimension );
			}

			return setPositiveNumber( elem, value, subtract );
		}
	};
} );

jQuery.cssHooks.marginLeft = addGetHookIf( support.reliableMarginLeft,
	function( elem, computed ) {
		if ( computed ) {
			return ( parseFloat( curCSS( elem, "marginLeft" ) ) ||
				elem.getBoundingClientRect().left -
					swap( elem, { marginLeft: 0 }, function() {
						return elem.getBoundingClientRect().left;
					} )
			) + "px";
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each( {
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// Assumes a single number if not a string
				parts = typeof value === "string" ? value.split( " " ) : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( prefix !== "margin" ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
} );

jQuery.fn.extend( {
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( Array.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	}
} );


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || jQuery.easing._default;
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			// Use a property on the element directly when it is not a DOM element,
			// or when there is no matching style property that exists.
			if ( tween.elem.nodeType !== 1 ||
				tween.elem[ tween.prop ] != null && tween.elem.style[ tween.prop ] == null ) {
				return tween.elem[ tween.prop ];
			}

			// Passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails.
			// Simple values such as "10px" are parsed to Float;
			// complex values such as "rotate(1rad)" are returned as-is.
			result = jQuery.css( tween.elem, tween.prop, "" );

			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {

			// Use step hook for back compat.
			// Use cssHook if its there.
			// Use .style if available and use plain properties where available.
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.nodeType === 1 && (
				jQuery.cssHooks[ tween.prop ] ||
					tween.elem.style[ finalPropName( tween.prop ) ] != null ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE <=9 only
// Panic based approach to setting things on disconnected nodes
Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	},
	_default: "swing"
};

jQuery.fx = Tween.prototype.init;

// Back compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, inProgress,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rrun = /queueHooks$/;

function schedule() {
	if ( inProgress ) {
		if ( document.hidden === false && window.requestAnimationFrame ) {
			window.requestAnimationFrame( schedule );
		} else {
			window.setTimeout( schedule, jQuery.fx.interval );
		}

		jQuery.fx.tick();
	}
}

// Animations created synchronously will run synchronously
function createFxNow() {
	window.setTimeout( function() {
		fxNow = undefined;
	} );
	return ( fxNow = Date.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		i = 0,
		attrs = { height: type };

	// If we include width, step value is 1 to do all cssExpand values,
	// otherwise step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( Animation.tweeners[ prop ] || [] ).concat( Animation.tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( ( tween = collection[ index ].call( animation, prop, value ) ) ) {

			// We're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	var prop, value, toggle, hooks, oldfire, propTween, restoreDisplay, display,
		isBox = "width" in props || "height" in props,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHiddenWithinTree( elem ),
		dataShow = dataPriv.get( elem, "fxshow" );

	// Queue-skipping animations hijack the fx hooks
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always( function() {

			// Ensure the complete handler is called before this completes
			anim.always( function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			} );
		} );
	}

	// Detect show/hide animations
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.test( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// Pretend to be hidden if this is a "show" and
				// there is still data from a stopped show/hide
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;

				// Ignore all other no-op show/hide data
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
		}
	}

	// Bail out if this is a no-op like .hide().hide()
	propTween = !jQuery.isEmptyObject( props );
	if ( !propTween && jQuery.isEmptyObject( orig ) ) {
		return;
	}

	// Restrict "overflow" and "display" styles during box animations
	if ( isBox && elem.nodeType === 1 ) {

		// Support: IE <=9 - 11, Edge 12 - 15
		// Record all 3 overflow attributes because IE does not infer the shorthand
		// from identically-valued overflowX and overflowY and Edge just mirrors
		// the overflowX value there.
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Identify a display type, preferring old show/hide data over the CSS cascade
		restoreDisplay = dataShow && dataShow.display;
		if ( restoreDisplay == null ) {
			restoreDisplay = dataPriv.get( elem, "display" );
		}
		display = jQuery.css( elem, "display" );
		if ( display === "none" ) {
			if ( restoreDisplay ) {
				display = restoreDisplay;
			} else {

				// Get nonempty value(s) by temporarily forcing visibility
				showHide( [ elem ], true );
				restoreDisplay = elem.style.display || restoreDisplay;
				display = jQuery.css( elem, "display" );
				showHide( [ elem ] );
			}
		}

		// Animate inline elements as inline-block
		if ( display === "inline" || display === "inline-block" && restoreDisplay != null ) {
			if ( jQuery.css( elem, "float" ) === "none" ) {

				// Restore the original display value at the end of pure show/hide animations
				if ( !propTween ) {
					anim.done( function() {
						style.display = restoreDisplay;
					} );
					if ( restoreDisplay == null ) {
						display = style.display;
						restoreDisplay = display === "none" ? "" : display;
					}
				}
				style.display = "inline-block";
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always( function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		} );
	}

	// Implement show/hide animations
	propTween = false;
	for ( prop in orig ) {

		// General show/hide setup for this element animation
		if ( !propTween ) {
			if ( dataShow ) {
				if ( "hidden" in dataShow ) {
					hidden = dataShow.hidden;
				}
			} else {
				dataShow = dataPriv.access( elem, "fxshow", { display: restoreDisplay } );
			}

			// Store hidden/visible for toggle so `.stop().toggle()` "reverses"
			if ( toggle ) {
				dataShow.hidden = !hidden;
			}

			// Show elements before animating them
			if ( hidden ) {
				showHide( [ elem ], true );
			}

			/* eslint-disable no-loop-func */

			anim.done( function() {

				/* eslint-enable no-loop-func */

				// The final step of a "hide" animation is actually hiding the element
				if ( !hidden ) {
					showHide( [ elem ] );
				}
				dataPriv.remove( elem, "fxshow" );
				for ( prop in orig ) {
					jQuery.style( elem, prop, orig[ prop ] );
				}
			} );
		}

		// Per-property setup
		propTween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );
		if ( !( prop in dataShow ) ) {
			dataShow[ prop ] = propTween.start;
			if ( hidden ) {
				propTween.end = propTween.start;
				propTween.start = 0;
			}
		}
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( Array.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// Not quite $.extend, this won't overwrite existing keys.
			// Reusing 'index' because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = Animation.prefilters.length,
		deferred = jQuery.Deferred().always( function() {

			// Don't match elem in the :animated selector
			delete tick.elem;
		} ),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),

				// Support: Android 2.3 only
				// Archaic crash bug won't allow us to use `1 - ( 0.5 || 0 )` (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ] );

			// If there's more to do, yield
			if ( percent < 1 && length ) {
				return remaining;
			}

			// If this was an empty animation, synthesize a final progress notification
			if ( !length ) {
				deferred.notifyWith( elem, [ animation, 1, 0 ] );
			}

			// Resolve the animation and report its conclusion
			deferred.resolveWith( elem, [ animation ] );
			return false;
		},
		animation = deferred.promise( {
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, {
				specialEasing: {},
				easing: jQuery.easing._default
			}, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
					animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,

					// If we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// Resolve when we played the last frame; otherwise, reject
				if ( gotoEnd ) {
					deferred.notifyWith( elem, [ animation, 1, 0 ] );
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		} ),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length; index++ ) {
		result = Animation.prefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			if ( isFunction( result.stop ) ) {
				jQuery._queueHooks( animation.elem, animation.opts.queue ).stop =
					result.stop.bind( result );
			}
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	// Attach callbacks from options
	animation
		.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		} )
	);

	return animation;
}

jQuery.Animation = jQuery.extend( Animation, {

	tweeners: {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value );
			adjustCSS( tween.elem, prop, rcssNum.exec( value ), tween );
			return tween;
		} ]
	},

	tweener: function( props, callback ) {
		if ( isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.match( rnothtmlwhite );
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length; index++ ) {
			prop = props[ index ];
			Animation.tweeners[ prop ] = Animation.tweeners[ prop ] || [];
			Animation.tweeners[ prop ].unshift( callback );
		}
	},

	prefilters: [ defaultPrefilter ],

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			Animation.prefilters.unshift( callback );
		} else {
			Animation.prefilters.push( callback );
		}
	}
} );

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !isFunction( easing ) && easing
	};

	// Go to the end state if fx are off
	if ( jQuery.fx.off ) {
		opt.duration = 0;

	} else {
		if ( typeof opt.duration !== "number" ) {
			if ( opt.duration in jQuery.fx.speeds ) {
				opt.duration = jQuery.fx.speeds[ opt.duration ];

			} else {
				opt.duration = jQuery.fx.speeds._default;
			}
		}
	}

	// Normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend( {
	fadeTo: function( speed, to, easing, callback ) {

		// Show any hidden elements after setting opacity to 0
		return this.filter( isHiddenWithinTree ).css( "opacity", 0 ).show()

			// Animate to the value specified
			.end().animate( { opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {

				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || dataPriv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};

		doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue ) {
			this.queue( type || "fx", [] );
		}

		return this.each( function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = dataPriv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this &&
					( type == null || timers[ index ].queue === type ) ) {

					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// Start the next in the queue if the last step wasn't forced.
			// Timers currently will call their complete callbacks, which
			// will dequeue but only if they were gotoEnd.
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		} );
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each( function() {
			var index,
				data = dataPriv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// Enable finishing flag on private data
			data.finish = true;

			// Empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// Look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// Look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// Turn off finishing flag
			delete data.finish;
		} );
	}
} );

jQuery.each( [ "toggle", "show", "hide" ], function( _i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
} );

// Generate shortcuts for custom animations
jQuery.each( {
	slideDown: genFx( "show" ),
	slideUp: genFx( "hide" ),
	slideToggle: genFx( "toggle" ),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
} );

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		i = 0,
		timers = jQuery.timers;

	fxNow = Date.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];

		// Run the timer and safely remove it when done (allowing for external removal)
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	jQuery.fx.start();
};

jQuery.fx.interval = 13;
jQuery.fx.start = function() {
	if ( inProgress ) {
		return;
	}

	inProgress = true;
	schedule();
};

jQuery.fx.stop = function() {
	inProgress = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,

	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// https://web.archive.org/web/20100324014747/http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = window.setTimeout( next, time );
		hooks.stop = function() {
			window.clearTimeout( timeout );
		};
	} );
};


( function() {
	var input = document.createElement( "input" ),
		select = document.createElement( "select" ),
		opt = select.appendChild( document.createElement( "option" ) );

	input.type = "checkbox";

	// Support: Android <=4.3 only
	// Default value for a checkbox should be "on"
	support.checkOn = input.value !== "";

	// Support: IE <=11 only
	// Must access selectedIndex to make default options select
	support.optSelected = opt.selected;

	// Support: IE <=11 only
	// An input loses its value after becoming a radio
	input = document.createElement( "input" );
	input.value = "t";
	input.type = "radio";
	support.radioValue = input.value === "t";
} )();


var boolHook,
	attrHandle = jQuery.expr.attrHandle;

jQuery.fn.extend( {
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each( function() {
			jQuery.removeAttr( this, name );
		} );
	}
} );

jQuery.extend( {
	attr: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set attributes on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === "undefined" ) {
			return jQuery.prop( elem, name, value );
		}

		// Attribute hooks are determined by the lowercase version
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			hooks = jQuery.attrHooks[ name.toLowerCase() ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : undefined );
		}

		if ( value !== undefined ) {
			if ( value === null ) {
				jQuery.removeAttr( elem, name );
				return;
			}

			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			elem.setAttribute( name, value + "" );
			return value;
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		ret = jQuery.find.attr( elem, name );

		// Non-existent attributes return null, we normalize to undefined
		return ret == null ? undefined : ret;
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" &&
					nodeName( elem, "input" ) ) {
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	},

	removeAttr: function( elem, value ) {
		var name,
			i = 0,

			// Attribute names can contain non-HTML whitespace characters
			// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
			attrNames = value && value.match( rnothtmlwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( ( name = attrNames[ i++ ] ) ) {
				elem.removeAttribute( name );
			}
		}
	}
} );

// Hooks for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {

			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			elem.setAttribute( name, name );
		}
		return name;
	}
};

jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( _i, name ) {
	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = function( elem, name, isXML ) {
		var ret, handle,
			lowercaseName = name.toLowerCase();

		if ( !isXML ) {

			// Avoid an infinite loop by temporarily removing this function from the getter
			handle = attrHandle[ lowercaseName ];
			attrHandle[ lowercaseName ] = ret;
			ret = getter( elem, name, isXML ) != null ?
				lowercaseName :
				null;
			attrHandle[ lowercaseName ] = handle;
		}
		return ret;
	};
} );




var rfocusable = /^(?:input|select|textarea|button)$/i,
	rclickable = /^(?:a|area)$/i;

jQuery.fn.extend( {
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each( function() {
			delete this[ jQuery.propFix[ name ] || name ];
		} );
	}
} );

jQuery.extend( {
	prop: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set properties on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {

			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			return ( elem[ name ] = value );
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		return elem[ name ];
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {

				// Support: IE <=9 - 11 only
				// elem.tabIndex doesn't always return the
				// correct value when it hasn't been explicitly set
				// https://web.archive.org/web/20141116233347/http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				// Use proper attribute retrieval(#12072)
				var tabindex = jQuery.find.attr( elem, "tabindex" );

				if ( tabindex ) {
					return parseInt( tabindex, 10 );
				}

				if (
					rfocusable.test( elem.nodeName ) ||
					rclickable.test( elem.nodeName ) &&
					elem.href
				) {
					return 0;
				}

				return -1;
			}
		}
	},

	propFix: {
		"for": "htmlFor",
		"class": "className"
	}
} );

// Support: IE <=11 only
// Accessing the selectedIndex property
// forces the browser to respect setting selected
// on the option
// The getter ensures a default option is selected
// when in an optgroup
// eslint rule "no-unused-expressions" is disabled for this code
// since it considers such accessions noop
if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {

			/* eslint no-unused-expressions: "off" */

			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				parent.parentNode.selectedIndex;
			}
			return null;
		},
		set: function( elem ) {

			/* eslint no-unused-expressions: "off" */

			var parent = elem.parentNode;
			if ( parent ) {
				parent.selectedIndex;

				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
		}
	};
}

jQuery.each( [
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
} );




	// Strip and collapse whitespace according to HTML spec
	// https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace
	function stripAndCollapse( value ) {
		var tokens = value.match( rnothtmlwhite ) || [];
		return tokens.join( " " );
	}


function getClass( elem ) {
	return elem.getAttribute && elem.getAttribute( "class" ) || "";
}

function classesToArray( value ) {
	if ( Array.isArray( value ) ) {
		return value;
	}
	if ( typeof value === "string" ) {
		return value.match( rnothtmlwhite ) || [];
	}
	return [];
}

jQuery.fn.extend( {
	addClass: function( value ) {
		var classes, elem, cur, curValue, clazz, j, finalValue,
			i = 0;

		if ( isFunction( value ) ) {
			return this.each( function( j ) {
				jQuery( this ).addClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		classes = classesToArray( value );

		if ( classes.length ) {
			while ( ( elem = this[ i++ ] ) ) {
				curValue = getClass( elem );
				cur = elem.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					j = 0;
					while ( ( clazz = classes[ j++ ] ) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						elem.setAttribute( "class", finalValue );
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, curValue, clazz, j, finalValue,
			i = 0;

		if ( isFunction( value ) ) {
			return this.each( function( j ) {
				jQuery( this ).removeClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		if ( !arguments.length ) {
			return this.attr( "class", "" );
		}

		classes = classesToArray( value );

		if ( classes.length ) {
			while ( ( elem = this[ i++ ] ) ) {
				curValue = getClass( elem );

				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					j = 0;
					while ( ( clazz = classes[ j++ ] ) ) {

						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) > -1 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						elem.setAttribute( "class", finalValue );
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value,
			isValidValue = type === "string" || Array.isArray( value );

		if ( typeof stateVal === "boolean" && isValidValue ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( isFunction( value ) ) {
			return this.each( function( i ) {
				jQuery( this ).toggleClass(
					value.call( this, i, getClass( this ), stateVal ),
					stateVal
				);
			} );
		}

		return this.each( function() {
			var className, i, self, classNames;

			if ( isValidValue ) {

				// Toggle individual class names
				i = 0;
				self = jQuery( this );
				classNames = classesToArray( value );

				while ( ( className = classNames[ i++ ] ) ) {

					// Check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( value === undefined || type === "boolean" ) {
				className = getClass( this );
				if ( className ) {

					// Store className if set
					dataPriv.set( this, "__className__", className );
				}

				// If the element has a class name or if we're passed `false`,
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				if ( this.setAttribute ) {
					this.setAttribute( "class",
						className || value === false ?
							"" :
							dataPriv.get( this, "__className__" ) || ""
					);
				}
			}
		} );
	},

	hasClass: function( selector ) {
		var className, elem,
			i = 0;

		className = " " + selector + " ";
		while ( ( elem = this[ i++ ] ) ) {
			if ( elem.nodeType === 1 &&
				( " " + stripAndCollapse( getClass( elem ) ) + " " ).indexOf( className ) > -1 ) {
				return true;
			}
		}

		return false;
	}
} );




var rreturn = /\r/g;

jQuery.fn.extend( {
	val: function( value ) {
		var hooks, ret, valueIsFunction,
			elem = this[ 0 ];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] ||
					jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks &&
					"get" in hooks &&
					( ret = hooks.get( elem, "value" ) ) !== undefined
				) {
					return ret;
				}

				ret = elem.value;

				// Handle most common string cases
				if ( typeof ret === "string" ) {
					return ret.replace( rreturn, "" );
				}

				// Handle cases where value is null/undef or number
				return ret == null ? "" : ret;
			}

			return;
		}

		valueIsFunction = isFunction( value );

		return this.each( function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( valueIsFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";

			} else if ( typeof val === "number" ) {
				val += "";

			} else if ( Array.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				} );
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !( "set" in hooks ) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		} );
	}
} );

jQuery.extend( {
	valHooks: {
		option: {
			get: function( elem ) {

				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :

					// Support: IE <=10 - 11 only
					// option.text throws exceptions (#14686, #14858)
					// Strip and collapse whitespace
					// https://html.spec.whatwg.org/#strip-and-collapse-whitespace
					stripAndCollapse( jQuery.text( elem ) );
			}
		},
		select: {
			get: function( elem ) {
				var value, option, i,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one",
					values = one ? null : [],
					max = one ? index + 1 : options.length;

				if ( index < 0 ) {
					i = max;

				} else {
					i = one ? index : 0;
				}

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// Support: IE <=9 only
					// IE8-9 doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&

							// Don't return options that are disabled or in a disabled optgroup
							!option.disabled &&
							( !option.parentNode.disabled ||
								!nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];

					/* eslint-disable no-cond-assign */

					if ( option.selected =
						jQuery.inArray( jQuery.valHooks.option.get( option ), values ) > -1
					) {
						optionSet = true;
					}

					/* eslint-enable no-cond-assign */
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	}
} );

// Radios and checkboxes getter/setter
jQuery.each( [ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( Array.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery( elem ).val(), value ) > -1 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			return elem.getAttribute( "value" ) === null ? "on" : elem.value;
		};
	}
} );




// Return jQuery for attributes-only inclusion


support.focusin = "onfocusin" in window;


var rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	stopPropagationCallback = function( e ) {
		e.stopPropagation();
	};

jQuery.extend( jQuery.event, {

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special, lastElement,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split( "." ) : [];

		cur = lastElement = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf( "." ) > -1 ) {

			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split( "." );
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf( ":" ) < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join( "." );
		event.rnamespace = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === ( elem.ownerDocument || document ) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( ( cur = eventPath[ i++ ] ) && !event.isPropagationStopped() ) {
			lastElement = cur;
			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( dataPriv.get( cur, "events" ) || Object.create( null ) )[ event.type ] &&
				dataPriv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( ( !special._default ||
				special._default.apply( eventPath.pop(), data ) === false ) &&
				acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name as the event.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && isFunction( elem[ type ] ) && !isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;

					if ( event.isPropagationStopped() ) {
						lastElement.addEventListener( type, stopPropagationCallback );
					}

					elem[ type ]();

					if ( event.isPropagationStopped() ) {
						lastElement.removeEventListener( type, stopPropagationCallback );
					}

					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	// Piggyback on a donor event to simulate a different one
	// Used only for `focus(in | out)` events
	simulate: function( type, elem, event ) {
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true
			}
		);

		jQuery.event.trigger( e, null, elem );
	}

} );

jQuery.fn.extend( {

	trigger: function( type, data ) {
		return this.each( function() {
			jQuery.event.trigger( type, data, this );
		} );
	},
	triggerHandler: function( type, data ) {
		var elem = this[ 0 ];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
} );


// Support: Firefox <=44
// Firefox doesn't have focus(in | out) events
// Related ticket - https://bugzilla.mozilla.org/show_bug.cgi?id=687787
//
// Support: Chrome <=48 - 49, Safari <=9.0 - 9.1
// focus(in | out) events fire after focus & blur events,
// which is spec violation - http://www.w3.org/TR/DOM-Level-3-Events/#events-focusevent-event-order
// Related ticket - https://bugs.chromium.org/p/chromium/issues/detail?id=449857
if ( !support.focusin ) {
	jQuery.each( { focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
			jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ) );
		};

		jQuery.event.special[ fix ] = {
			setup: function() {

				// Handle: regular nodes (via `this.ownerDocument`), window
				// (via `this.document`) & document (via `this`).
				var doc = this.ownerDocument || this.document || this,
					attaches = dataPriv.access( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				dataPriv.access( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this.document || this,
					attaches = dataPriv.access( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					dataPriv.remove( doc, fix );

				} else {
					dataPriv.access( doc, fix, attaches );
				}
			}
		};
	} );
}
var location = window.location;

var nonce = { guid: Date.now() };

var rquery = ( /\?/ );



// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml, parserErrorElem;
	if ( !data || typeof data !== "string" ) {
		return null;
	}

	// Support: IE 9 - 11 only
	// IE throws on parseFromString with invalid input.
	try {
		xml = ( new window.DOMParser() ).parseFromString( data, "text/xml" );
	} catch ( e ) {}

	parserErrorElem = xml && xml.getElementsByTagName( "parsererror" )[ 0 ];
	if ( !xml || parserErrorElem ) {
		jQuery.error( "Invalid XML: " + (
			parserErrorElem ?
				jQuery.map( parserErrorElem.childNodes, function( el ) {
					return el.textContent;
				} ).join( "\n" ) :
				data
		) );
	}
	return xml;
};


var
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( Array.isArray( obj ) ) {

		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {

				// Treat each array item as a scalar.
				add( prefix, v );

			} else {

				// Item is non-scalar (array or object), encode its numeric index.
				buildParams(
					prefix + "[" + ( typeof v === "object" && v != null ? i : "" ) + "]",
					v,
					traditional,
					add
				);
			}
		} );

	} else if ( !traditional && toType( obj ) === "object" ) {

		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {

		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, valueOrFunction ) {

			// If value is a function, invoke it and use its return value
			var value = isFunction( valueOrFunction ) ?
				valueOrFunction() :
				valueOrFunction;

			s[ s.length ] = encodeURIComponent( key ) + "=" +
				encodeURIComponent( value == null ? "" : value );
		};

	if ( a == null ) {
		return "";
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( Array.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {

		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		} );

	} else {

		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" );
};

jQuery.fn.extend( {
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map( function() {

			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		} ).filter( function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		} ).map( function( _i, elem ) {
			var val = jQuery( this ).val();

			if ( val == null ) {
				return null;
			}

			if ( Array.isArray( val ) ) {
				return jQuery.map( val, function( val ) {
					return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
				} );
			}

			return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		} ).get();
	}
} );


var
	r20 = /%20/g,
	rhash = /#.*$/,
	rantiCache = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,

	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat( "*" ),

	// Anchor tag for parsing the document origin
	originAnchor = document.createElement( "a" );

originAnchor.href = location.href;

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnothtmlwhite ) || [];

		if ( isFunction( func ) ) {

			// For each dataType in the dataTypeExpression
			while ( ( dataType = dataTypes[ i++ ] ) ) {

				// Prepend if requested
				if ( dataType[ 0 ] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					( structure[ dataType ] = structure[ dataType ] || [] ).unshift( func );

				// Otherwise append
				} else {
					( structure[ dataType ] = structure[ dataType ] || [] ).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" &&
				!seekingTransport && !inspected[ dataTypeOrTransport ] ) {

				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		} );
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader( "Content-Type" );
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {

		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[ 0 ] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}

		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},

		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

			// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {

								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s.throws ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return {
								state: "parsererror",
								error: conv ? e : "No conversion from " + prev + " to " + current
							};
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend( {

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: location.href,
		type: "GET",
		isLocal: rlocalProtocol.test( location.protocol ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",

		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /\bxml\b/,
			html: /\bhtml/,
			json: /\bjson\b/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": JSON.parse,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,

			// URL without anti-cache param
			cacheURL,

			// Response headers
			responseHeadersString,
			responseHeaders,

			// timeout handle
			timeoutTimer,

			// Url cleanup var
			urlAnchor,

			// Request state (becomes false upon send and true upon completion)
			completed,

			// To know if global events are to be dispatched
			fireGlobals,

			// Loop variable
			i,

			// uncached part of the url
			uncached,

			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),

			// Callbacks context
			callbackContext = s.context || s,

			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context &&
				( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,

			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks( "once memory" ),

			// Status-dependent callbacks
			statusCode = s.statusCode || {},

			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},

			// Default abort message
			strAbort = "canceled",

			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( completed ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( ( match = rheaders.exec( responseHeadersString ) ) ) {
								responseHeaders[ match[ 1 ].toLowerCase() + " " ] =
									( responseHeaders[ match[ 1 ].toLowerCase() + " " ] || [] )
										.concat( match[ 2 ] );
							}
						}
						match = responseHeaders[ key.toLowerCase() + " " ];
					}
					return match == null ? null : match.join( ", " );
				},

				// Raw string
				getAllResponseHeaders: function() {
					return completed ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					if ( completed == null ) {
						name = requestHeadersNames[ name.toLowerCase() ] =
							requestHeadersNames[ name.toLowerCase() ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( completed == null ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( completed ) {

							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						} else {

							// Lazy-add the new callbacks in a way that preserves old ones
							for ( code in map ) {
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR );

		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || location.href ) + "" )
			.replace( rprotocol, location.protocol + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = ( s.dataType || "*" ).toLowerCase().match( rnothtmlwhite ) || [ "" ];

		// A cross-domain request is in order when the origin doesn't match the current origin.
		if ( s.crossDomain == null ) {
			urlAnchor = document.createElement( "a" );

			// Support: IE <=8 - 11, Edge 12 - 15
			// IE throws exception on accessing the href property if url is malformed,
			// e.g. http://example.com:80x/
			try {
				urlAnchor.href = s.url;

				// Support: IE <=8 - 11 only
				// Anchor's host property isn't correctly set when s.url is relative
				urlAnchor.href = urlAnchor.href;
				s.crossDomain = originAnchor.protocol + "//" + originAnchor.host !==
					urlAnchor.protocol + "//" + urlAnchor.host;
			} catch ( e ) {

				// If there is an error parsing the URL, assume it is crossDomain,
				// it can be rejected by the transport if it is invalid
				s.crossDomain = true;
			}
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( completed ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (#15118)
		fireGlobals = jQuery.event && s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger( "ajaxStart" );
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		// Remove hash to simplify url manipulation
		cacheURL = s.url.replace( rhash, "" );

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// Remember the hash so we can put it back
			uncached = s.url.slice( cacheURL.length );

			// If data is available and should be processed, append data to url
			if ( s.data && ( s.processData || typeof s.data === "string" ) ) {
				cacheURL += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data;

				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add or update anti-cache param if needed
			if ( s.cache === false ) {
				cacheURL = cacheURL.replace( rantiCache, "$1" );
				uncached = ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + ( nonce.guid++ ) +
					uncached;
			}

			// Put hash and anti-cache on the URL that will be requested (gh-1732)
			s.url = cacheURL + uncached;

		// Change '%20' to '+' if this is encoded form body content (gh-2658)
		} else if ( s.data && s.processData &&
			( s.contentType || "" ).indexOf( "application/x-www-form-urlencoded" ) === 0 ) {
			s.data = s.data.replace( r20, "+" );
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[ 0 ] ] ?
				s.accepts[ s.dataTypes[ 0 ] ] +
					( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend &&
			( s.beforeSend.call( callbackContext, jqXHR, s ) === false || completed ) ) {

			// Abort if not done already and return
			return jqXHR.abort();
		}

		// Aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		completeDeferred.add( s.complete );
		jqXHR.done( s.success );
		jqXHR.fail( s.error );

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}

			// If request was aborted inside ajaxSend, stop there
			if ( completed ) {
				return jqXHR;
			}

			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = window.setTimeout( function() {
					jqXHR.abort( "timeout" );
				}, s.timeout );
			}

			try {
				completed = false;
				transport.send( requestHeaders, done );
			} catch ( e ) {

				// Rethrow post-completion exceptions
				if ( completed ) {
					throw e;
				}

				// Propagate others as results
				done( -1, e );
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Ignore repeat invocations
			if ( completed ) {
				return;
			}

			completed = true;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				window.clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Use a noop converter for missing script but not if jsonp
			if ( !isSuccess &&
				jQuery.inArray( "script", s.dataTypes ) > -1 &&
				jQuery.inArray( "json", s.dataTypes ) < 0 ) {
				s.converters[ "text script" ] = function() {};
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader( "Last-Modified" );
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader( "etag" );
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {

				// Extract error from statusText and normalize for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );

				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger( "ajaxStop" );
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
} );

jQuery.each( [ "get", "post" ], function( _i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {

		// Shift arguments if data argument was omitted
		if ( isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		// The url can be an options object (which then must have .url)
		return jQuery.ajax( jQuery.extend( {
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		}, jQuery.isPlainObject( url ) && url ) );
	};
} );

jQuery.ajaxPrefilter( function( s ) {
	var i;
	for ( i in s.headers ) {
		if ( i.toLowerCase() === "content-type" ) {
			s.contentType = s.headers[ i ] || "";
		}
	}
} );


jQuery._evalUrl = function( url, options, doc ) {
	return jQuery.ajax( {
		url: url,

		// Make this explicit, since user can override this through ajaxSetup (#11264)
		type: "GET",
		dataType: "script",
		cache: true,
		async: false,
		global: false,

		// Only evaluate the response if it is successful (gh-4126)
		// dataFilter is not invoked for failure responses, so using it instead
		// of the default converter is kludgy but it works.
		converters: {
			"text script": function() {}
		},
		dataFilter: function( response ) {
			jQuery.globalEval( response, options, doc );
		}
	} );
};


jQuery.fn.extend( {
	wrapAll: function( html ) {
		var wrap;

		if ( this[ 0 ] ) {
			if ( isFunction( html ) ) {
				html = html.call( this[ 0 ] );
			}

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map( function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			} ).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( isFunction( html ) ) {
			return this.each( function( i ) {
				jQuery( this ).wrapInner( html.call( this, i ) );
			} );
		}

		return this.each( function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		} );
	},

	wrap: function( html ) {
		var htmlIsFunction = isFunction( html );

		return this.each( function( i ) {
			jQuery( this ).wrapAll( htmlIsFunction ? html.call( this, i ) : html );
		} );
	},

	unwrap: function( selector ) {
		this.parent( selector ).not( "body" ).each( function() {
			jQuery( this ).replaceWith( this.childNodes );
		} );
		return this;
	}
} );


jQuery.expr.pseudos.hidden = function( elem ) {
	return !jQuery.expr.pseudos.visible( elem );
};
jQuery.expr.pseudos.visible = function( elem ) {
	return !!( elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length );
};




jQuery.ajaxSettings.xhr = function() {
	try {
		return new window.XMLHttpRequest();
	} catch ( e ) {}
};

var xhrSuccessStatus = {

		// File protocol always yields status code 0, assume 200
		0: 200,

		// Support: IE <=9 only
		// #1450: sometimes IE returns 1223 when it should be 204
		1223: 204
	},
	xhrSupported = jQuery.ajaxSettings.xhr();

support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
support.ajax = xhrSupported = !!xhrSupported;

jQuery.ajaxTransport( function( options ) {
	var callback, errorCallback;

	// Cross domain only allowed if supported through XMLHttpRequest
	if ( support.cors || xhrSupported && !options.crossDomain ) {
		return {
			send: function( headers, complete ) {
				var i,
					xhr = options.xhr();

				xhr.open(
					options.type,
					options.url,
					options.async,
					options.username,
					options.password
				);

				// Apply custom fields if provided
				if ( options.xhrFields ) {
					for ( i in options.xhrFields ) {
						xhr[ i ] = options.xhrFields[ i ];
					}
				}

				// Override mime type if needed
				if ( options.mimeType && xhr.overrideMimeType ) {
					xhr.overrideMimeType( options.mimeType );
				}

				// X-Requested-With header
				// For cross-domain requests, seeing as conditions for a preflight are
				// akin to a jigsaw puzzle, we simply never set it to be sure.
				// (it can always be set on a per-request basis or even using ajaxSetup)
				// For same-domain requests, won't change header if already provided.
				if ( !options.crossDomain && !headers[ "X-Requested-With" ] ) {
					headers[ "X-Requested-With" ] = "XMLHttpRequest";
				}

				// Set headers
				for ( i in headers ) {
					xhr.setRequestHeader( i, headers[ i ] );
				}

				// Callback
				callback = function( type ) {
					return function() {
						if ( callback ) {
							callback = errorCallback = xhr.onload =
								xhr.onerror = xhr.onabort = xhr.ontimeout =
									xhr.onreadystatechange = null;

							if ( type === "abort" ) {
								xhr.abort();
							} else if ( type === "error" ) {

								// Support: IE <=9 only
								// On a manual native abort, IE9 throws
								// errors on any property access that is not readyState
								if ( typeof xhr.status !== "number" ) {
									complete( 0, "error" );
								} else {
									complete(

										// File: protocol always yields status 0; see #8605, #14207
										xhr.status,
										xhr.statusText
									);
								}
							} else {
								complete(
									xhrSuccessStatus[ xhr.status ] || xhr.status,
									xhr.statusText,

									// Support: IE <=9 only
									// IE9 has no XHR2 but throws on binary (trac-11426)
									// For XHR2 non-text, let the caller handle it (gh-2498)
									( xhr.responseType || "text" ) !== "text"  ||
									typeof xhr.responseText !== "string" ?
										{ binary: xhr.response } :
										{ text: xhr.responseText },
									xhr.getAllResponseHeaders()
								);
							}
						}
					};
				};

				// Listen to events
				xhr.onload = callback();
				errorCallback = xhr.onerror = xhr.ontimeout = callback( "error" );

				// Support: IE 9 only
				// Use onreadystatechange to replace onabort
				// to handle uncaught aborts
				if ( xhr.onabort !== undefined ) {
					xhr.onabort = errorCallback;
				} else {
					xhr.onreadystatechange = function() {

						// Check readyState before timeout as it changes
						if ( xhr.readyState === 4 ) {

							// Allow onerror to be called first,
							// but that will not handle a native abort
							// Also, save errorCallback to a variable
							// as xhr.onerror cannot be accessed
							window.setTimeout( function() {
								if ( callback ) {
									errorCallback();
								}
							} );
						}
					};
				}

				// Create the abort callback
				callback = callback( "abort" );

				try {

					// Do send the request (this may raise an exception)
					xhr.send( options.hasContent && options.data || null );
				} catch ( e ) {

					// #14683: Only rethrow if this hasn't been notified as an error yet
					if ( callback ) {
						throw e;
					}
				}
			},

			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
} );




// Prevent auto-execution of scripts when no explicit dataType was provided (See gh-2432)
jQuery.ajaxPrefilter( function( s ) {
	if ( s.crossDomain ) {
		s.contents.script = false;
	}
} );

// Install script dataType
jQuery.ajaxSetup( {
	accepts: {
		script: "text/javascript, application/javascript, " +
			"application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /\b(?:java|ecma)script\b/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
} );

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
	}
} );

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {

	// This transport only deals with cross domain or forced-by-attrs requests
	if ( s.crossDomain || s.scriptAttrs ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery( "<script>" )
					.attr( s.scriptAttrs || {} )
					.prop( { charset: s.scriptCharset, src: s.url } )
					.on( "load error", callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					} );

				// Use native DOM manipulation to avoid our domManip AJAX trickery
				document.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
} );




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup( {
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce.guid++ ) );
		this[ callback ] = true;
		return callback;
	}
} );

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" &&
				( s.contentType || "" )
					.indexOf( "application/x-www-form-urlencoded" ) === 0 &&
				rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters[ "script json" ] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// Force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always( function() {

			// If previous value didn't exist - remove it
			if ( overwritten === undefined ) {
				jQuery( window ).removeProp( callbackName );

			// Otherwise restore preexisting value
			} else {
				window[ callbackName ] = overwritten;
			}

			// Save back as free
			if ( s[ callbackName ] ) {

				// Make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// Save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		} );

		// Delegate to script
		return "script";
	}
} );




// Support: Safari 8 only
// In Safari 8 documents created via document.implementation.createHTMLDocument
// collapse sibling forms: the second one becomes a child of the first one.
// Because of that, this security measure has to be disabled in Safari 8.
// https://bugs.webkit.org/show_bug.cgi?id=137337
support.createHTMLDocument = ( function() {
	var body = document.implementation.createHTMLDocument( "" ).body;
	body.innerHTML = "<form></form><form></form>";
	return body.childNodes.length === 2;
} )();


// Argument "data" should be string of html
// context (optional): If specified, the fragment will be created in this context,
// defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( typeof data !== "string" ) {
		return [];
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}

	var base, parsed, scripts;

	if ( !context ) {

		// Stop scripts or inline event handlers from being executed immediately
		// by using document.implementation
		if ( support.createHTMLDocument ) {
			context = document.implementation.createHTMLDocument( "" );

			// Set the base href for the created document
			// so any parsed elements with URLs
			// are based on the document's URL (gh-2965)
			base = context.createElement( "base" );
			base.href = document.location.href;
			context.head.appendChild( base );
		} else {
			context = document;
		}
	}

	parsed = rsingleTag.exec( data );
	scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[ 1 ] ) ];
	}

	parsed = buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	var selector, type, response,
		self = this,
		off = url.indexOf( " " );

	if ( off > -1 ) {
		selector = stripAndCollapse( url.slice( off ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax( {
			url: url,

			// If "type" variable is undefined, then "GET" method will be used.
			// Make value of this field explicit since
			// user can override it through ajaxSetup method
			type: type || "GET",
			dataType: "html",
			data: params
		} ).done( function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery( "<div>" ).append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		// If the request succeeds, this function gets "data", "status", "jqXHR"
		// but they are ignored because response was set above.
		// If it fails, this function gets "jqXHR", "status", "error"
		} ).always( callback && function( jqXHR, status ) {
			self.each( function() {
				callback.apply( this, response || [ jqXHR.responseText, status, jqXHR ] );
			} );
		} );
	}

	return this;
};




jQuery.expr.pseudos.animated = function( elem ) {
	return jQuery.grep( jQuery.timers, function( fn ) {
		return elem === fn.elem;
	} ).length;
};




jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			( curCSSTop + curCSSLeft ).indexOf( "auto" ) > -1;

		// Need to be able to calculate position if either
		// top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( isFunction( options ) ) {

			// Use jQuery.extend here to allow modification of coordinates argument (gh-1848)
			options = options.call( elem, i, jQuery.extend( {}, curOffset ) );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend( {

	// offset() relates an element's border box to the document origin
	offset: function( options ) {

		// Preserve chaining for setter
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each( function( i ) {
					jQuery.offset.setOffset( this, options, i );
				} );
		}

		var rect, win,
			elem = this[ 0 ];

		if ( !elem ) {
			return;
		}

		// Return zeros for disconnected and hidden (display: none) elements (gh-2310)
		// Support: IE <=11 only
		// Running getBoundingClientRect on a
		// disconnected node in IE throws an error
		if ( !elem.getClientRects().length ) {
			return { top: 0, left: 0 };
		}

		// Get document-relative position by adding viewport scroll to viewport-relative gBCR
		rect = elem.getBoundingClientRect();
		win = elem.ownerDocument.defaultView;
		return {
			top: rect.top + win.pageYOffset,
			left: rect.left + win.pageXOffset
		};
	},

	// position() relates an element's margin box to its offset parent's padding box
	// This corresponds to the behavior of CSS absolute positioning
	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset, doc,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// position:fixed elements are offset from the viewport, which itself always has zero offset
		if ( jQuery.css( elem, "position" ) === "fixed" ) {

			// Assume position:fixed implies availability of getBoundingClientRect
			offset = elem.getBoundingClientRect();

		} else {
			offset = this.offset();

			// Account for the *real* offset parent, which can be the document or its root element
			// when a statically positioned element is identified
			doc = elem.ownerDocument;
			offsetParent = elem.offsetParent || doc.documentElement;
			while ( offsetParent &&
				( offsetParent === doc.body || offsetParent === doc.documentElement ) &&
				jQuery.css( offsetParent, "position" ) === "static" ) {

				offsetParent = offsetParent.parentNode;
			}
			if ( offsetParent && offsetParent !== elem && offsetParent.nodeType === 1 ) {

				// Incorporate borders into its offset, since they are outside its content origin
				parentOffset = jQuery( offsetParent ).offset();
				parentOffset.top += jQuery.css( offsetParent, "borderTopWidth", true );
				parentOffset.left += jQuery.css( offsetParent, "borderLeftWidth", true );
			}
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	// This method will return documentElement in the following cases:
	// 1) For the element inside the iframe without offsetParent, this method will return
	//    documentElement of the parent window
	// 2) For the hidden or detached element
	// 3) For body or html element, i.e. in case of the html node - it will return itself
	//
	// but those exceptions were never presented as a real life use-cases
	// and might be considered as more preferable results.
	//
	// This logic, however, is not guaranteed and can change at any point in the future
	offsetParent: function() {
		return this.map( function() {
			var offsetParent = this.offsetParent;

			while ( offsetParent && jQuery.css( offsetParent, "position" ) === "static" ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || documentElement;
		} );
	}
} );

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {

			// Coalesce documents and windows
			var win;
			if ( isWindow( elem ) ) {
				win = elem;
			} else if ( elem.nodeType === 9 ) {
				win = elem.defaultView;
			}

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : win.pageXOffset,
					top ? val : win.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length );
	};
} );

// Support: Safari <=7 - 9.1, Chrome <=37 - 49
// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// Blink bug: https://bugs.chromium.org/p/chromium/issues/detail?id=589347
// getComputedStyle returns percent when specified for top/left/bottom/right;
// rather than make the css module depend on the offset module, just check for it here
jQuery.each( [ "top", "left" ], function( _i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );

				// If curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
} );


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( {
		padding: "inner" + name,
		content: type,
		"": "outer" + name
	}, function( defaultExtra, funcName ) {

		// Margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( isWindow( elem ) ) {

					// $( window ).outerWidth/Height return w/h including scrollbars (gh-1729)
					return funcName.indexOf( "outer" ) === 0 ?
						elem[ "inner" + name ] :
						elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?

					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable );
		};
	} );
} );


jQuery.each( [
	"ajaxStart",
	"ajaxStop",
	"ajaxComplete",
	"ajaxError",
	"ajaxSuccess",
	"ajaxSend"
], function( _i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
} );




jQuery.fn.extend( {

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {

		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ?
			this.off( selector, "**" ) :
			this.off( types, selector || "**", fn );
	},

	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	}
} );

jQuery.each(
	( "blur focus focusin focusout resize scroll click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup contextmenu" ).split( " " ),
	function( _i, name ) {

		// Handle event binding
		jQuery.fn[ name ] = function( data, fn ) {
			return arguments.length > 0 ?
				this.on( name, null, data, fn ) :
				this.trigger( name );
		};
	}
);




// Support: Android <=4.0 only
// Make sure we trim BOM and NBSP
var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;

// Bind a function to a context, optionally partially applying any
// arguments.
// jQuery.proxy is deprecated to promote standards (specifically Function#bind)
// However, it is not slated for removal any time soon
jQuery.proxy = function( fn, context ) {
	var tmp, args, proxy;

	if ( typeof context === "string" ) {
		tmp = fn[ context ];
		context = fn;
		fn = tmp;
	}

	// Quick check to determine if target is callable, in the spec
	// this throws a TypeError, but we will just return undefined.
	if ( !isFunction( fn ) ) {
		return undefined;
	}

	// Simulated bind
	args = slice.call( arguments, 2 );
	proxy = function() {
		return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
	};

	// Set the guid of unique handler to the same of original handler, so it can be removed
	proxy.guid = fn.guid = fn.guid || jQuery.guid++;

	return proxy;
};

jQuery.holdReady = function( hold ) {
	if ( hold ) {
		jQuery.readyWait++;
	} else {
		jQuery.ready( true );
	}
};
jQuery.isArray = Array.isArray;
jQuery.parseJSON = JSON.parse;
jQuery.nodeName = nodeName;
jQuery.isFunction = isFunction;
jQuery.isWindow = isWindow;
jQuery.camelCase = camelCase;
jQuery.type = toType;

jQuery.now = Date.now;

jQuery.isNumeric = function( obj ) {

	// As of jQuery 3.0, isNumeric is limited to
	// strings and numbers (primitives or objects)
	// that can be coerced to finite numbers (gh-2662)
	var type = jQuery.type( obj );
	return ( type === "number" || type === "string" ) &&

		// parseFloat NaNs numeric-cast false positives ("")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		!isNaN( obj - parseFloat( obj ) );
};

jQuery.trim = function( text ) {
	return text == null ?
		"" :
		( text + "" ).replace( rtrim, "" );
};



// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( true ) {
	!(__WEBPACK_AMD_DEFINE_ARRAY__ = [], __WEBPACK_AMD_DEFINE_RESULT__ = (function() {
		return jQuery;
	}).apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__),
		__WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
}




var

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in AMD
// (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( typeof noGlobal === "undefined" ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;
} );


/***/ }),

/***/ 8337:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";



////////////////////////////////////////////////////////////////////////////////
// Helpers

// Merge objects
//
function assign(obj /*from1, from2, from3, ...*/) {
  var sources = Array.prototype.slice.call(arguments, 1);

  sources.forEach(function (source) {
    if (!source) { return; }

    Object.keys(source).forEach(function (key) {
      obj[key] = source[key];
    });
  });

  return obj;
}

function _class(obj) { return Object.prototype.toString.call(obj); }
function isString(obj) { return _class(obj) === '[object String]'; }
function isObject(obj) { return _class(obj) === '[object Object]'; }
function isRegExp(obj) { return _class(obj) === '[object RegExp]'; }
function isFunction(obj) { return _class(obj) === '[object Function]'; }


function escapeRE(str) { return str.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&'); }

////////////////////////////////////////////////////////////////////////////////


var defaultOptions = {
  fuzzyLink: true,
  fuzzyEmail: true,
  fuzzyIP: false
};


function isOptionsObj(obj) {
  return Object.keys(obj || {}).reduce(function (acc, k) {
    return acc || defaultOptions.hasOwnProperty(k);
  }, false);
}


var defaultSchemas = {
  'http:': {
    validate: function (text, pos, self) {
      var tail = text.slice(pos);

      if (!self.re.http) {
        // compile lazily, because "host"-containing variables can change on tlds update.
        self.re.http =  new RegExp(
          '^\\/\\/' + self.re.src_auth + self.re.src_host_port_strict + self.re.src_path, 'i'
        );
      }
      if (self.re.http.test(tail)) {
        return tail.match(self.re.http)[0].length;
      }
      return 0;
    }
  },
  'https:':  'http:',
  'ftp:':    'http:',
  '//':      {
    validate: function (text, pos, self) {
      var tail = text.slice(pos);

      if (!self.re.no_http) {
      // compile lazily, because "host"-containing variables can change on tlds update.
        self.re.no_http =  new RegExp(
          '^' +
          self.re.src_auth +
          // Don't allow single-level domains, because of false positives like '//test'
          // with code comments
          '(?:localhost|(?:(?:' + self.re.src_domain + ')\\.)+' + self.re.src_domain_root + ')' +
          self.re.src_port +
          self.re.src_host_terminator +
          self.re.src_path,

          'i'
        );
      }

      if (self.re.no_http.test(tail)) {
        // should not be `://` & `///`, that protects from errors in protocol name
        if (pos >= 3 && text[pos - 3] === ':') { return 0; }
        if (pos >= 3 && text[pos - 3] === '/') { return 0; }
        return tail.match(self.re.no_http)[0].length;
      }
      return 0;
    }
  },
  'mailto:': {
    validate: function (text, pos, self) {
      var tail = text.slice(pos);

      if (!self.re.mailto) {
        self.re.mailto =  new RegExp(
          '^' + self.re.src_email_name + '@' + self.re.src_host_strict, 'i'
        );
      }
      if (self.re.mailto.test(tail)) {
        return tail.match(self.re.mailto)[0].length;
      }
      return 0;
    }
  }
};

/*eslint-disable max-len*/

// RE pattern for 2-character tlds (autogenerated by ./support/tlds_2char_gen.js)
var tlds_2ch_src_re = 'a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]';

// DON'T try to make PRs with changes. Extend TLDs with LinkifyIt.tlds() instead
var tlds_default = 'biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф'.split('|');

/*eslint-enable max-len*/

////////////////////////////////////////////////////////////////////////////////

function resetScanCache(self) {
  self.__index__ = -1;
  self.__text_cache__   = '';
}

function createValidator(re) {
  return function (text, pos) {
    var tail = text.slice(pos);

    if (re.test(tail)) {
      return tail.match(re)[0].length;
    }
    return 0;
  };
}

function createNormalizer() {
  return function (match, self) {
    self.normalize(match);
  };
}

// Schemas compiler. Build regexps.
//
function compile(self) {

  // Load & clone RE patterns.
  var re = self.re = __webpack_require__(6066)(self.__opts__);

  // Define dynamic patterns
  var tlds = self.__tlds__.slice();

  self.onCompile();

  if (!self.__tlds_replaced__) {
    tlds.push(tlds_2ch_src_re);
  }
  tlds.push(re.src_xn);

  re.src_tlds = tlds.join('|');

  function untpl(tpl) { return tpl.replace('%TLDS%', re.src_tlds); }

  re.email_fuzzy      = RegExp(untpl(re.tpl_email_fuzzy), 'i');
  re.link_fuzzy       = RegExp(untpl(re.tpl_link_fuzzy), 'i');
  re.link_no_ip_fuzzy = RegExp(untpl(re.tpl_link_no_ip_fuzzy), 'i');
  re.host_fuzzy_test  = RegExp(untpl(re.tpl_host_fuzzy_test), 'i');

  //
  // Compile each schema
  //

  var aliases = [];

  self.__compiled__ = {}; // Reset compiled data

  function schemaError(name, val) {
    throw new Error('(LinkifyIt) Invalid schema "' + name + '": ' + val);
  }

  Object.keys(self.__schemas__).forEach(function (name) {
    var val = self.__schemas__[name];

    // skip disabled methods
    if (val === null) { return; }

    var compiled = { validate: null, link: null };

    self.__compiled__[name] = compiled;

    if (isObject(val)) {
      if (isRegExp(val.validate)) {
        compiled.validate = createValidator(val.validate);
      } else if (isFunction(val.validate)) {
        compiled.validate = val.validate;
      } else {
        schemaError(name, val);
      }

      if (isFunction(val.normalize)) {
        compiled.normalize = val.normalize;
      } else if (!val.normalize) {
        compiled.normalize = createNormalizer();
      } else {
        schemaError(name, val);
      }

      return;
    }

    if (isString(val)) {
      aliases.push(name);
      return;
    }

    schemaError(name, val);
  });

  //
  // Compile postponed aliases
  //

  aliases.forEach(function (alias) {
    if (!self.__compiled__[self.__schemas__[alias]]) {
      // Silently fail on missed schemas to avoid errons on disable.
      // schemaError(alias, self.__schemas__[alias]);
      return;
    }

    self.__compiled__[alias].validate =
      self.__compiled__[self.__schemas__[alias]].validate;
    self.__compiled__[alias].normalize =
      self.__compiled__[self.__schemas__[alias]].normalize;
  });

  //
  // Fake record for guessed links
  //
  self.__compiled__[''] = { validate: null, normalize: createNormalizer() };

  //
  // Build schema condition
  //
  var slist = Object.keys(self.__compiled__)
                      .filter(function (name) {
                        // Filter disabled & fake schemas
                        return name.length > 0 && self.__compiled__[name];
                      })
                      .map(escapeRE)
                      .join('|');
  // (?!_) cause 1.5x slowdown
  self.re.schema_test     = RegExp('(^|(?!_)(?:[><\uff5c]|' + re.src_ZPCc + '))(' + slist + ')', 'i');
  self.re.schema_search   = RegExp('(^|(?!_)(?:[><\uff5c]|' + re.src_ZPCc + '))(' + slist + ')', 'ig');
  self.re.schema_at_start = RegExp('^' + self.re.schema_search.source, 'i');

  self.re.pretest = RegExp(
    '(' + self.re.schema_test.source + ')|(' + self.re.host_fuzzy_test.source + ')|@',
    'i'
  );

  //
  // Cleanup
  //

  resetScanCache(self);
}

/**
 * class Match
 *
 * Match result. Single element of array, returned by [[LinkifyIt#match]]
 **/
function Match(self, shift) {
  var start = self.__index__,
      end   = self.__last_index__,
      text  = self.__text_cache__.slice(start, end);

  /**
   * Match#schema -> String
   *
   * Prefix (protocol) for matched string.
   **/
  this.schema    = self.__schema__.toLowerCase();
  /**
   * Match#index -> Number
   *
   * First position of matched string.
   **/
  this.index     = start + shift;
  /**
   * Match#lastIndex -> Number
   *
   * Next position after matched string.
   **/
  this.lastIndex = end + shift;
  /**
   * Match#raw -> String
   *
   * Matched string.
   **/
  this.raw       = text;
  /**
   * Match#text -> String
   *
   * Notmalized text of matched string.
   **/
  this.text      = text;
  /**
   * Match#url -> String
   *
   * Normalized url of matched string.
   **/
  this.url       = text;
}

function createMatch(self, shift) {
  var match = new Match(self, shift);

  self.__compiled__[match.schema].normalize(match, self);

  return match;
}


/**
 * class LinkifyIt
 **/

/**
 * new LinkifyIt(schemas, options)
 * - schemas (Object): Optional. Additional schemas to validate (prefix/validator)
 * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
 *
 * Creates new linkifier instance with optional additional schemas.
 * Can be called without `new` keyword for convenience.
 *
 * By default understands:
 *
 * - `http(s)://...` , `ftp://...`, `mailto:...` & `//...` links
 * - "fuzzy" links and emails (example.com, foo@bar.com).
 *
 * `schemas` is an object, where each key/value describes protocol/rule:
 *
 * - __key__ - link prefix (usually, protocol name with `:` at the end, `skype:`
 *   for example). `linkify-it` makes shure that prefix is not preceeded with
 *   alphanumeric char and symbols. Only whitespaces and punctuation allowed.
 * - __value__ - rule to check tail after link prefix
 *   - _String_ - just alias to existing rule
 *   - _Object_
 *     - _validate_ - validator function (should return matched length on success),
 *       or `RegExp`.
 *     - _normalize_ - optional function to normalize text & url of matched result
 *       (for example, for @twitter mentions).
 *
 * `options`:
 *
 * - __fuzzyLink__ - recognige URL-s without `http(s):` prefix. Default `true`.
 * - __fuzzyIP__ - allow IPs in fuzzy links above. Can conflict with some texts
 *   like version numbers. Default `false`.
 * - __fuzzyEmail__ - recognize emails without `mailto:` prefix.
 *
 **/
function LinkifyIt(schemas, options) {
  if (!(this instanceof LinkifyIt)) {
    return new LinkifyIt(schemas, options);
  }

  if (!options) {
    if (isOptionsObj(schemas)) {
      options = schemas;
      schemas = {};
    }
  }

  this.__opts__           = assign({}, defaultOptions, options);

  // Cache last tested result. Used to skip repeating steps on next `match` call.
  this.__index__          = -1;
  this.__last_index__     = -1; // Next scan position
  this.__schema__         = '';
  this.__text_cache__     = '';

  this.__schemas__        = assign({}, defaultSchemas, schemas);
  this.__compiled__       = {};

  this.__tlds__           = tlds_default;
  this.__tlds_replaced__  = false;

  this.re = {};

  compile(this);
}


/** chainable
 * LinkifyIt#add(schema, definition)
 * - schema (String): rule name (fixed pattern prefix)
 * - definition (String|RegExp|Object): schema definition
 *
 * Add new rule definition. See constructor description for details.
 **/
LinkifyIt.prototype.add = function add(schema, definition) {
  this.__schemas__[schema] = definition;
  compile(this);
  return this;
};


/** chainable
 * LinkifyIt#set(options)
 * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
 *
 * Set recognition options for links without schema.
 **/
LinkifyIt.prototype.set = function set(options) {
  this.__opts__ = assign(this.__opts__, options);
  return this;
};


/**
 * LinkifyIt#test(text) -> Boolean
 *
 * Searches linkifiable pattern and returns `true` on success or `false` on fail.
 **/
LinkifyIt.prototype.test = function test(text) {
  // Reset scan cache
  this.__text_cache__ = text;
  this.__index__      = -1;

  if (!text.length) { return false; }

  var m, ml, me, len, shift, next, re, tld_pos, at_pos;

  // try to scan for link with schema - that's the most simple rule
  if (this.re.schema_test.test(text)) {
    re = this.re.schema_search;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      len = this.testSchemaAt(text, m[2], re.lastIndex);
      if (len) {
        this.__schema__     = m[2];
        this.__index__      = m.index + m[1].length;
        this.__last_index__ = m.index + m[0].length + len;
        break;
      }
    }
  }

  if (this.__opts__.fuzzyLink && this.__compiled__['http:']) {
    // guess schemaless links
    tld_pos = text.search(this.re.host_fuzzy_test);
    if (tld_pos >= 0) {
      // if tld is located after found link - no need to check fuzzy pattern
      if (this.__index__ < 0 || tld_pos < this.__index__) {
        if ((ml = text.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy)) !== null) {

          shift = ml.index + ml[1].length;

          if (this.__index__ < 0 || shift < this.__index__) {
            this.__schema__     = '';
            this.__index__      = shift;
            this.__last_index__ = ml.index + ml[0].length;
          }
        }
      }
    }
  }

  if (this.__opts__.fuzzyEmail && this.__compiled__['mailto:']) {
    // guess schemaless emails
    at_pos = text.indexOf('@');
    if (at_pos >= 0) {
      // We can't skip this check, because this cases are possible:
      // 192.168.1.1@gmail.com, my.in@example.com
      if ((me = text.match(this.re.email_fuzzy)) !== null) {

        shift = me.index + me[1].length;
        next  = me.index + me[0].length;

        if (this.__index__ < 0 || shift < this.__index__ ||
            (shift === this.__index__ && next > this.__last_index__)) {
          this.__schema__     = 'mailto:';
          this.__index__      = shift;
          this.__last_index__ = next;
        }
      }
    }
  }

  return this.__index__ >= 0;
};


/**
 * LinkifyIt#pretest(text) -> Boolean
 *
 * Very quick check, that can give false positives. Returns true if link MAY BE
 * can exists. Can be used for speed optimization, when you need to check that
 * link NOT exists.
 **/
LinkifyIt.prototype.pretest = function pretest(text) {
  return this.re.pretest.test(text);
};


/**
 * LinkifyIt#testSchemaAt(text, name, position) -> Number
 * - text (String): text to scan
 * - name (String): rule (schema) name
 * - position (Number): text offset to check from
 *
 * Similar to [[LinkifyIt#test]] but checks only specific protocol tail exactly
 * at given position. Returns length of found pattern (0 on fail).
 **/
LinkifyIt.prototype.testSchemaAt = function testSchemaAt(text, schema, pos) {
  // If not supported schema check requested - terminate
  if (!this.__compiled__[schema.toLowerCase()]) {
    return 0;
  }
  return this.__compiled__[schema.toLowerCase()].validate(text, pos, this);
};


/**
 * LinkifyIt#match(text) -> Array|null
 *
 * Returns array of found link descriptions or `null` on fail. We strongly
 * recommend to use [[LinkifyIt#test]] first, for best speed.
 *
 * ##### Result match description
 *
 * - __schema__ - link schema, can be empty for fuzzy links, or `//` for
 *   protocol-neutral  links.
 * - __index__ - offset of matched text
 * - __lastIndex__ - index of next char after mathch end
 * - __raw__ - matched text
 * - __text__ - normalized text
 * - __url__ - link, generated from matched text
 **/
LinkifyIt.prototype.match = function match(text) {
  var shift = 0, result = [];

  // Try to take previous element from cache, if .test() called before
  if (this.__index__ >= 0 && this.__text_cache__ === text) {
    result.push(createMatch(this, shift));
    shift = this.__last_index__;
  }

  // Cut head if cache was used
  var tail = shift ? text.slice(shift) : text;

  // Scan string until end reached
  while (this.test(tail)) {
    result.push(createMatch(this, shift));

    tail = tail.slice(this.__last_index__);
    shift += this.__last_index__;
  }

  if (result.length) {
    return result;
  }

  return null;
};


/**
 * LinkifyIt#matchAtStart(text) -> Match|null
 *
 * Returns fully-formed (not fuzzy) link if it starts at the beginning
 * of the string, and null otherwise.
 **/
LinkifyIt.prototype.matchAtStart = function matchAtStart(text) {
  // Reset scan cache
  this.__text_cache__ = text;
  this.__index__      = -1;

  if (!text.length) return null;

  var m = this.re.schema_at_start.exec(text);
  if (!m) return null;

  var len = this.testSchemaAt(text, m[2], m[0].length);
  if (!len) return null;

  this.__schema__     = m[2];
  this.__index__      = m.index + m[1].length;
  this.__last_index__ = m.index + m[0].length + len;

  return createMatch(this, 0);
};


/** chainable
 * LinkifyIt#tlds(list [, keepOld]) -> this
 * - list (Array): list of tlds
 * - keepOld (Boolean): merge with current list if `true` (`false` by default)
 *
 * Load (or merge) new tlds list. Those are user for fuzzy links (without prefix)
 * to avoid false positives. By default this algorythm used:
 *
 * - hostname with any 2-letter root zones are ok.
 * - biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф
 *   are ok.
 * - encoded (`xn--...`) root zones are ok.
 *
 * If list is replaced, then exact match for 2-chars root zones will be checked.
 **/
LinkifyIt.prototype.tlds = function tlds(list, keepOld) {
  list = Array.isArray(list) ? list : [ list ];

  if (!keepOld) {
    this.__tlds__ = list.slice();
    this.__tlds_replaced__ = true;
    compile(this);
    return this;
  }

  this.__tlds__ = this.__tlds__.concat(list)
                                  .sort()
                                  .filter(function (el, idx, arr) {
                                    return el !== arr[idx - 1];
                                  })
                                  .reverse();

  compile(this);
  return this;
};

/**
 * LinkifyIt#normalize(match)
 *
 * Default normalizer (if schema does not define it's own).
 **/
LinkifyIt.prototype.normalize = function normalize(match) {

  // Do minimal possible changes by default. Need to collect feedback prior
  // to move forward https://github.com/markdown-it/linkify-it/issues/1

  if (!match.schema) { match.url = 'http://' + match.url; }

  if (match.schema === 'mailto:' && !/^mailto:/i.test(match.url)) {
    match.url = 'mailto:' + match.url;
  }
};


/**
 * LinkifyIt#onCompile()
 *
 * Override to modify basic RegExp-s.
 **/
LinkifyIt.prototype.onCompile = function onCompile() {
};


module.exports = LinkifyIt;


/***/ }),

/***/ 6066:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";



module.exports = function (opts) {
  var re = {};
  opts = opts || {};

  // Use direct extract instead of `regenerate` to reduse browserified size
  re.src_Any = (__webpack_require__(9369).source);
  re.src_Cc  = (__webpack_require__(9413).source);
  re.src_Z   = (__webpack_require__(5045).source);
  re.src_P   = (__webpack_require__(3189).source);

  // \p{\Z\P\Cc\CF} (white spaces + control + format + punctuation)
  re.src_ZPCc = [ re.src_Z, re.src_P, re.src_Cc ].join('|');

  // \p{\Z\Cc} (white spaces + control)
  re.src_ZCc = [ re.src_Z, re.src_Cc ].join('|');

  // Experimental. List of chars, completely prohibited in links
  // because can separate it from other part of text
  var text_separators = '[><\uff5c]';

  // All possible word characters (everything without punctuation, spaces & controls)
  // Defined via punctuation & spaces to save space
  // Should be something like \p{\L\N\S\M} (\w but without `_`)
  re.src_pseudo_letter       = '(?:(?!' + text_separators + '|' + re.src_ZPCc + ')' + re.src_Any + ')';
  // The same as abothe but without [0-9]
  // var src_pseudo_letter_non_d = '(?:(?![0-9]|' + src_ZPCc + ')' + src_Any + ')';

  ////////////////////////////////////////////////////////////////////////////////

  re.src_ip4 =

    '(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';

  // Prohibit any of "@/[]()" in user/pass to avoid wrong domain fetch.
  re.src_auth    = '(?:(?:(?!' + re.src_ZCc + '|[@/\\[\\]()]).)+@)?';

  re.src_port =

    '(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?';

  re.src_host_terminator =

    '(?=$|' + text_separators + '|' + re.src_ZPCc + ')' +
    '(?!' + (opts['---'] ? '-(?!--)|' : '-|') + '_|:\\d|\\.-|\\.(?!$|' + re.src_ZPCc + '))';

  re.src_path =

    '(?:' +
      '[/?#]' +
        '(?:' +
          '(?!' + re.src_ZCc + '|' + text_separators + '|[()[\\]{}.,"\'?!\\-;]).|' +
          '\\[(?:(?!' + re.src_ZCc + '|\\]).)*\\]|' +
          '\\((?:(?!' + re.src_ZCc + '|[)]).)*\\)|' +
          '\\{(?:(?!' + re.src_ZCc + '|[}]).)*\\}|' +
          '\\"(?:(?!' + re.src_ZCc + '|["]).)+\\"|' +
          "\\'(?:(?!" + re.src_ZCc + "|[']).)+\\'|" +
          "\\'(?=" + re.src_pseudo_letter + '|[-])|' +  // allow `I'm_king` if no pair found
          '\\.{2,}[a-zA-Z0-9%/&]|' + // google has many dots in "google search" links (#66, #81).
                                     // github has ... in commit range links,
                                     // Restrict to
                                     // - english
                                     // - percent-encoded
                                     // - parts of file path
                                     // - params separator
                                     // until more examples found.
          '\\.(?!' + re.src_ZCc + '|[.]|$)|' +
          (opts['---'] ?
            '\\-(?!--(?:[^-]|$))(?:-*)|' // `---` => long dash, terminate
            :
            '\\-+|'
          ) +
          ',(?!' + re.src_ZCc + '|$)|' +       // allow `,,,` in paths
          ';(?!' + re.src_ZCc + '|$)|' +       // allow `;` if not followed by space-like char
          '\\!+(?!' + re.src_ZCc + '|[!]|$)|' +  // allow `!!!` in paths, but not at the end
          '\\?(?!' + re.src_ZCc + '|[?]|$)' +
        ')+' +
      '|\\/' +
    ')?';

  // Allow anything in markdown spec, forbid quote (") at the first position
  // because emails enclosed in quotes are far more common
  re.src_email_name =

    '[\\-;:&=\\+\\$,\\.a-zA-Z0-9_][\\-;:&=\\+\\$,\\"\\.a-zA-Z0-9_]*';

  re.src_xn =

    'xn--[a-z0-9\\-]{1,59}';

  // More to read about domain names
  // http://serverfault.com/questions/638260/

  re.src_domain_root =

    // Allow letters & digits (http://test1)
    '(?:' +
      re.src_xn +
      '|' +
      re.src_pseudo_letter + '{1,63}' +
    ')';

  re.src_domain =

    '(?:' +
      re.src_xn +
      '|' +
      '(?:' + re.src_pseudo_letter + ')' +
      '|' +
      '(?:' + re.src_pseudo_letter + '(?:-|' + re.src_pseudo_letter + '){0,61}' + re.src_pseudo_letter + ')' +
    ')';

  re.src_host =

    '(?:' +
    // Don't need IP check, because digits are already allowed in normal domain names
    //   src_ip4 +
    // '|' +
      '(?:(?:(?:' + re.src_domain + ')\\.)*' + re.src_domain/*_root*/ + ')' +
    ')';

  re.tpl_host_fuzzy =

    '(?:' +
      re.src_ip4 +
    '|' +
      '(?:(?:(?:' + re.src_domain + ')\\.)+(?:%TLDS%))' +
    ')';

  re.tpl_host_no_ip_fuzzy =

    '(?:(?:(?:' + re.src_domain + ')\\.)+(?:%TLDS%))';

  re.src_host_strict =

    re.src_host + re.src_host_terminator;

  re.tpl_host_fuzzy_strict =

    re.tpl_host_fuzzy + re.src_host_terminator;

  re.src_host_port_strict =

    re.src_host + re.src_port + re.src_host_terminator;

  re.tpl_host_port_fuzzy_strict =

    re.tpl_host_fuzzy + re.src_port + re.src_host_terminator;

  re.tpl_host_port_no_ip_fuzzy_strict =

    re.tpl_host_no_ip_fuzzy + re.src_port + re.src_host_terminator;


  ////////////////////////////////////////////////////////////////////////////////
  // Main rules

  // Rude test fuzzy links by host, for quick deny
  re.tpl_host_fuzzy_test =

    'localhost|www\\.|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:' + re.src_ZPCc + '|>|$))';

  re.tpl_email_fuzzy =

      '(^|' + text_separators + '|"|\\(|' + re.src_ZCc + ')' +
      '(' + re.src_email_name + '@' + re.tpl_host_fuzzy_strict + ')';

  re.tpl_link_fuzzy =
      // Fuzzy link can't be prepended with .:/\- and non punctuation.
      // but can start with > (markdown blockquote)
      '(^|(?![.:/\\-_@])(?:[$+<=>^`|\uff5c]|' + re.src_ZPCc + '))' +
      '((?![$+<=>^`|\uff5c])' + re.tpl_host_port_fuzzy_strict + re.src_path + ')';

  re.tpl_link_no_ip_fuzzy =
      // Fuzzy link can't be prepended with .:/\- and non punctuation.
      // but can start with > (markdown blockquote)
      '(^|(?![.:/\\-_@])(?:[$+<=>^`|\uff5c]|' + re.src_ZPCc + '))' +
      '((?![$+<=>^`|\uff5c])' + re.tpl_host_port_no_ip_fuzzy_strict + re.src_path + ')';

  return re;
};


/***/ }),

/***/ 9980:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";



module.exports = __webpack_require__(7024);


/***/ }),

/***/ 6233:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// HTML5 entities map: { name -> utf16string }
//


/*eslint quotes:0*/
module.exports = __webpack_require__(5485);


/***/ }),

/***/ 813:
/***/ ((module) => {

"use strict";
// List of valid html blocks names, accorting to commonmark spec
// http://jgm.github.io/CommonMark/spec.html#html-blocks




module.exports = [
  'address',
  'article',
  'aside',
  'base',
  'basefont',
  'blockquote',
  'body',
  'caption',
  'center',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'iframe',
  'legend',
  'li',
  'link',
  'main',
  'menu',
  'menuitem',
  'nav',
  'noframes',
  'ol',
  'optgroup',
  'option',
  'p',
  'param',
  'section',
  'source',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'track',
  'ul'
];


/***/ }),

/***/ 1947:
/***/ ((module) => {

"use strict";
// Regexps to match html elements



var attr_name     = '[a-zA-Z_:][a-zA-Z0-9:._-]*';

var unquoted      = '[^"\'=<>`\\x00-\\x20]+';
var single_quoted = "'[^']*'";
var double_quoted = '"[^"]*"';

var attr_value  = '(?:' + unquoted + '|' + single_quoted + '|' + double_quoted + ')';

var attribute   = '(?:\\s+' + attr_name + '(?:\\s*=\\s*' + attr_value + ')?)';

var open_tag    = '<[A-Za-z][A-Za-z0-9\\-]*' + attribute + '*\\s*\\/?>';

var close_tag   = '<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>';
var comment     = '<!---->|<!--(?:-?[^>-])(?:-?[^-])*-->';
var processing  = '<[?][\\s\\S]*?[?]>';
var declaration = '<![A-Z]+\\s+[^>]*>';
var cdata       = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';

var HTML_TAG_RE = new RegExp('^(?:' + open_tag + '|' + close_tag + '|' + comment +
                        '|' + processing + '|' + declaration + '|' + cdata + ')');
var HTML_OPEN_CLOSE_TAG_RE = new RegExp('^(?:' + open_tag + '|' + close_tag + ')');

module.exports.n = HTML_TAG_RE;
module.exports.q = HTML_OPEN_CLOSE_TAG_RE;


/***/ }),

/***/ 7022:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";
// Utilities
//



function _class(obj) { return Object.prototype.toString.call(obj); }

function isString(obj) { return _class(obj) === '[object String]'; }

var _hasOwnProperty = Object.prototype.hasOwnProperty;

function has(object, key) {
  return _hasOwnProperty.call(object, key);
}

// Merge objects
//
function assign(obj /*from1, from2, from3, ...*/) {
  var sources = Array.prototype.slice.call(arguments, 1);

  sources.forEach(function (source) {
    if (!source) { return; }

    if (typeof source !== 'object') {
      throw new TypeError(source + 'must be object');
    }

    Object.keys(source).forEach(function (key) {
      obj[key] = source[key];
    });
  });

  return obj;
}

// Remove element from array and put another array at those position.
// Useful for some operations with tokens
function arrayReplaceAt(src, pos, newElements) {
  return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
}

////////////////////////////////////////////////////////////////////////////////

function isValidEntityCode(c) {
  /*eslint no-bitwise:0*/
  // broken sequence
  if (c >= 0xD800 && c <= 0xDFFF) { return false; }
  // never used
  if (c >= 0xFDD0 && c <= 0xFDEF) { return false; }
  if ((c & 0xFFFF) === 0xFFFF || (c & 0xFFFF) === 0xFFFE) { return false; }
  // control codes
  if (c >= 0x00 && c <= 0x08) { return false; }
  if (c === 0x0B) { return false; }
  if (c >= 0x0E && c <= 0x1F) { return false; }
  if (c >= 0x7F && c <= 0x9F) { return false; }
  // out of range
  if (c > 0x10FFFF) { return false; }
  return true;
}

function fromCodePoint(c) {
  /*eslint no-bitwise:0*/
  if (c > 0xffff) {
    c -= 0x10000;
    var surrogate1 = 0xd800 + (c >> 10),
        surrogate2 = 0xdc00 + (c & 0x3ff);

    return String.fromCharCode(surrogate1, surrogate2);
  }
  return String.fromCharCode(c);
}


var UNESCAPE_MD_RE  = /\\([!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~])/g;
var ENTITY_RE       = /&([a-z#][a-z0-9]{1,31});/gi;
var UNESCAPE_ALL_RE = new RegExp(UNESCAPE_MD_RE.source + '|' + ENTITY_RE.source, 'gi');

var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))/i;

var entities = __webpack_require__(6233);

function replaceEntityPattern(match, name) {
  var code = 0;

  if (has(entities, name)) {
    return entities[name];
  }

  if (name.charCodeAt(0) === 0x23/* # */ && DIGITAL_ENTITY_TEST_RE.test(name)) {
    code = name[1].toLowerCase() === 'x' ?
      parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);

    if (isValidEntityCode(code)) {
      return fromCodePoint(code);
    }
  }

  return match;
}

/*function replaceEntities(str) {
  if (str.indexOf('&') < 0) { return str; }

  return str.replace(ENTITY_RE, replaceEntityPattern);
}*/

function unescapeMd(str) {
  if (str.indexOf('\\') < 0) { return str; }
  return str.replace(UNESCAPE_MD_RE, '$1');
}

function unescapeAll(str) {
  if (str.indexOf('\\') < 0 && str.indexOf('&') < 0) { return str; }

  return str.replace(UNESCAPE_ALL_RE, function (match, escaped, entity) {
    if (escaped) { return escaped; }
    return replaceEntityPattern(match, entity);
  });
}

////////////////////////////////////////////////////////////////////////////////

var HTML_ESCAPE_TEST_RE = /[&<>"]/;
var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
var HTML_REPLACEMENTS = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
};

function replaceUnsafeChar(ch) {
  return HTML_REPLACEMENTS[ch];
}

function escapeHtml(str) {
  if (HTML_ESCAPE_TEST_RE.test(str)) {
    return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
  }
  return str;
}

////////////////////////////////////////////////////////////////////////////////

var REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;

function escapeRE(str) {
  return str.replace(REGEXP_ESCAPE_RE, '\\$&');
}

////////////////////////////////////////////////////////////////////////////////

function isSpace(code) {
  switch (code) {
    case 0x09:
    case 0x20:
      return true;
  }
  return false;
}

// Zs (unicode class) || [\t\f\v\r\n]
function isWhiteSpace(code) {
  if (code >= 0x2000 && code <= 0x200A) { return true; }
  switch (code) {
    case 0x09: // \t
    case 0x0A: // \n
    case 0x0B: // \v
    case 0x0C: // \f
    case 0x0D: // \r
    case 0x20:
    case 0xA0:
    case 0x1680:
    case 0x202F:
    case 0x205F:
    case 0x3000:
      return true;
  }
  return false;
}

////////////////////////////////////////////////////////////////////////////////

/*eslint-disable max-len*/
var UNICODE_PUNCT_RE = __webpack_require__(3189);

// Currently without astral characters support.
function isPunctChar(ch) {
  return UNICODE_PUNCT_RE.test(ch);
}


// Markdown ASCII punctuation characters.
//
// !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
// http://spec.commonmark.org/0.15/#ascii-punctuation-character
//
// Don't confuse with unicode punctuation !!! It lacks some chars in ascii range.
//
function isMdAsciiPunct(ch) {
  switch (ch) {
    case 0x21/* ! */:
    case 0x22/* " */:
    case 0x23/* # */:
    case 0x24/* $ */:
    case 0x25/* % */:
    case 0x26/* & */:
    case 0x27/* ' */:
    case 0x28/* ( */:
    case 0x29/* ) */:
    case 0x2A/* * */:
    case 0x2B/* + */:
    case 0x2C/* , */:
    case 0x2D/* - */:
    case 0x2E/* . */:
    case 0x2F/* / */:
    case 0x3A/* : */:
    case 0x3B/* ; */:
    case 0x3C/* < */:
    case 0x3D/* = */:
    case 0x3E/* > */:
    case 0x3F/* ? */:
    case 0x40/* @ */:
    case 0x5B/* [ */:
    case 0x5C/* \ */:
    case 0x5D/* ] */:
    case 0x5E/* ^ */:
    case 0x5F/* _ */:
    case 0x60/* ` */:
    case 0x7B/* { */:
    case 0x7C/* | */:
    case 0x7D/* } */:
    case 0x7E/* ~ */:
      return true;
    default:
      return false;
  }
}

// Hepler to unify [reference labels].
//
function normalizeReference(str) {
  // Trim and collapse whitespace
  //
  str = str.trim().replace(/\s+/g, ' ');

  // In node v10 'ẞ'.toLowerCase() === 'Ṿ', which is presumed to be a bug
  // fixed in v12 (couldn't find any details).
  //
  // So treat this one as a special case
  // (remove this when node v10 is no longer supported).
  //
  if ('ẞ'.toLowerCase() === 'Ṿ') {
    str = str.replace(/ẞ/g, 'ß');
  }

  // .toLowerCase().toUpperCase() should get rid of all differences
  // between letter variants.
  //
  // Simple .toLowerCase() doesn't normalize 125 code points correctly,
  // and .toUpperCase doesn't normalize 6 of them (list of exceptions:
  // İ, ϴ, ẞ, Ω, K, Å - those are already uppercased, but have differently
  // uppercased versions).
  //
  // Here's an example showing how it happens. Lets take greek letter omega:
  // uppercase U+0398 (Θ), U+03f4 (ϴ) and lowercase U+03b8 (θ), U+03d1 (ϑ)
  //
  // Unicode entries:
  // 0398;GREEK CAPITAL LETTER THETA;Lu;0;L;;;;;N;;;;03B8;
  // 03B8;GREEK SMALL LETTER THETA;Ll;0;L;;;;;N;;;0398;;0398
  // 03D1;GREEK THETA SYMBOL;Ll;0;L;<compat> 03B8;;;;N;GREEK SMALL LETTER SCRIPT THETA;;0398;;0398
  // 03F4;GREEK CAPITAL THETA SYMBOL;Lu;0;L;<compat> 0398;;;;N;;;;03B8;
  //
  // Case-insensitive comparison should treat all of them as equivalent.
  //
  // But .toLowerCase() doesn't change ϑ (it's already lowercase),
  // and .toUpperCase() doesn't change ϴ (already uppercase).
  //
  // Applying first lower then upper case normalizes any character:
  // '\u0398\u03f4\u03b8\u03d1'.toLowerCase().toUpperCase() === '\u0398\u0398\u0398\u0398'
  //
  // Note: this is equivalent to unicode case folding; unicode normalization
  // is a different step that is not required here.
  //
  // Final result should be uppercased, because it's later stored in an object
  // (this avoid a conflict with Object.prototype members,
  // most notably, `__proto__`)
  //
  return str.toLowerCase().toUpperCase();
}

////////////////////////////////////////////////////////////////////////////////

// Re-export libraries commonly used in both markdown-it and its plugins,
// so plugins won't have to depend on them explicitly, which reduces their
// bundled size (e.g. a browser build).
//
exports.lib                 = {};
exports.lib.mdurl = __webpack_require__(8765);
exports.lib.ucmicro = __webpack_require__(4205);

exports.assign              = assign;
exports.isString            = isString;
exports.has                 = has;
exports.unescapeMd          = unescapeMd;
exports.unescapeAll         = unescapeAll;
exports.isValidEntityCode   = isValidEntityCode;
exports.fromCodePoint       = fromCodePoint;
// exports.replaceEntities     = replaceEntities;
exports.escapeHtml          = escapeHtml;
exports.arrayReplaceAt      = arrayReplaceAt;
exports.isSpace             = isSpace;
exports.isWhiteSpace        = isWhiteSpace;
exports.isMdAsciiPunct      = isMdAsciiPunct;
exports.isPunctChar         = isPunctChar;
exports.escapeRE            = escapeRE;
exports.normalizeReference  = normalizeReference;


/***/ }),

/***/ 1685:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";
// Just a shortcut for bulk export



exports.parseLinkLabel = __webpack_require__(3595);
exports.parseLinkDestination = __webpack_require__(2548);
exports.parseLinkTitle = __webpack_require__(8040);


/***/ }),

/***/ 2548:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Parse link destination
//



var unescapeAll = (__webpack_require__(7022).unescapeAll);


module.exports = function parseLinkDestination(str, pos, max) {
  var code, level,
      lines = 0,
      start = pos,
      result = {
        ok: false,
        pos: 0,
        lines: 0,
        str: ''
      };

  if (str.charCodeAt(pos) === 0x3C /* < */) {
    pos++;
    while (pos < max) {
      code = str.charCodeAt(pos);
      if (code === 0x0A /* \n */) { return result; }
      if (code === 0x3C /* < */) { return result; }
      if (code === 0x3E /* > */) {
        result.pos = pos + 1;
        result.str = unescapeAll(str.slice(start + 1, pos));
        result.ok = true;
        return result;
      }
      if (code === 0x5C /* \ */ && pos + 1 < max) {
        pos += 2;
        continue;
      }

      pos++;
    }

    // no closing '>'
    return result;
  }

  // this should be ... } else { ... branch

  level = 0;
  while (pos < max) {
    code = str.charCodeAt(pos);

    if (code === 0x20) { break; }

    // ascii control characters
    if (code < 0x20 || code === 0x7F) { break; }

    if (code === 0x5C /* \ */ && pos + 1 < max) {
      if (str.charCodeAt(pos + 1) === 0x20) { break; }
      pos += 2;
      continue;
    }

    if (code === 0x28 /* ( */) {
      level++;
      if (level > 32) { return result; }
    }

    if (code === 0x29 /* ) */) {
      if (level === 0) { break; }
      level--;
    }

    pos++;
  }

  if (start === pos) { return result; }
  if (level !== 0) { return result; }

  result.str = unescapeAll(str.slice(start, pos));
  result.lines = lines;
  result.pos = pos;
  result.ok = true;
  return result;
};


/***/ }),

/***/ 3595:
/***/ ((module) => {

"use strict";
// Parse link label
//
// this function assumes that first character ("[") already matches;
// returns the end of the label
//


module.exports = function parseLinkLabel(state, start, disableNested) {
  var level, found, marker, prevPos,
      labelEnd = -1,
      max = state.posMax,
      oldPos = state.pos;

  state.pos = start + 1;
  level = 1;

  while (state.pos < max) {
    marker = state.src.charCodeAt(state.pos);
    if (marker === 0x5D /* ] */) {
      level--;
      if (level === 0) {
        found = true;
        break;
      }
    }

    prevPos = state.pos;
    state.md.inline.skipToken(state);
    if (marker === 0x5B /* [ */) {
      if (prevPos === state.pos - 1) {
        // increase level if we find text `[`, which is not a part of any token
        level++;
      } else if (disableNested) {
        state.pos = oldPos;
        return -1;
      }
    }
  }

  if (found) {
    labelEnd = state.pos;
  }

  // restore old state
  state.pos = oldPos;

  return labelEnd;
};


/***/ }),

/***/ 8040:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Parse link title
//



var unescapeAll = (__webpack_require__(7022).unescapeAll);


module.exports = function parseLinkTitle(str, pos, max) {
  var code,
      marker,
      lines = 0,
      start = pos,
      result = {
        ok: false,
        pos: 0,
        lines: 0,
        str: ''
      };

  if (pos >= max) { return result; }

  marker = str.charCodeAt(pos);

  if (marker !== 0x22 /* " */ && marker !== 0x27 /* ' */ && marker !== 0x28 /* ( */) { return result; }

  pos++;

  // if opening marker is "(", switch it to closing marker ")"
  if (marker === 0x28) { marker = 0x29; }

  while (pos < max) {
    code = str.charCodeAt(pos);
    if (code === marker) {
      result.pos = pos + 1;
      result.lines = lines;
      result.str = unescapeAll(str.slice(start + 1, pos));
      result.ok = true;
      return result;
    } else if (code === 0x28 /* ( */ && marker === 0x29 /* ) */) {
      return result;
    } else if (code === 0x0A) {
      lines++;
    } else if (code === 0x5C /* \ */ && pos + 1 < max) {
      pos++;
      if (str.charCodeAt(pos) === 0x0A) {
        lines++;
      }
    }

    pos++;
  }

  return result;
};


/***/ }),

/***/ 7024:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Main parser class




var utils        = __webpack_require__(7022);
var helpers      = __webpack_require__(1685);
var Renderer     = __webpack_require__(7529);
var ParserCore   = __webpack_require__(7346);
var ParserBlock  = __webpack_require__(2471);
var ParserInline = __webpack_require__(4485);
var LinkifyIt    = __webpack_require__(8337);
var mdurl        = __webpack_require__(8765);
var punycode     = __webpack_require__(3689);


var config = {
  default: __webpack_require__(4218),
  zero: __webpack_require__(873),
  commonmark: __webpack_require__(6895)
};

////////////////////////////////////////////////////////////////////////////////
//
// This validator can prohibit more than really needed to prevent XSS. It's a
// tradeoff to keep code simple and to be secure by default.
//
// If you need different setup - override validator method as you wish. Or
// replace it with dummy function and use external sanitizer.
//

var BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
var GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;

function validateLink(url) {
  // url should be normalized at this point, and existing entities are decoded
  var str = url.trim().toLowerCase();

  return BAD_PROTO_RE.test(str) ? (GOOD_DATA_RE.test(str) ? true : false) : true;
}

////////////////////////////////////////////////////////////////////////////////


var RECODE_HOSTNAME_FOR = [ 'http:', 'https:', 'mailto:' ];

function normalizeLink(url) {
  var parsed = mdurl.parse(url, true);

  if (parsed.hostname) {
    // Encode hostnames in urls like:
    // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
    //
    // We don't encode unknown schemas, because it's likely that we encode
    // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
    //
    if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
      try {
        parsed.hostname = punycode.toASCII(parsed.hostname);
      } catch (er) { /**/ }
    }
  }

  return mdurl.encode(mdurl.format(parsed));
}

function normalizeLinkText(url) {
  var parsed = mdurl.parse(url, true);

  if (parsed.hostname) {
    // Encode hostnames in urls like:
    // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
    //
    // We don't encode unknown schemas, because it's likely that we encode
    // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
    //
    if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
      try {
        parsed.hostname = punycode.toUnicode(parsed.hostname);
      } catch (er) { /**/ }
    }
  }

  // add '%' to exclude list because of https://github.com/markdown-it/markdown-it/issues/720
  return mdurl.decode(mdurl.format(parsed), mdurl.decode.defaultChars + '%');
}


/**
 * class MarkdownIt
 *
 * Main parser/renderer class.
 *
 * ##### Usage
 *
 * ```javascript
 * // node.js, "classic" way:
 * var MarkdownIt = require('markdown-it'),
 *     md = new MarkdownIt();
 * var result = md.render('# markdown-it rulezz!');
 *
 * // node.js, the same, but with sugar:
 * var md = require('markdown-it')();
 * var result = md.render('# markdown-it rulezz!');
 *
 * // browser without AMD, added to "window" on script load
 * // Note, there are no dash.
 * var md = window.markdownit();
 * var result = md.render('# markdown-it rulezz!');
 * ```
 *
 * Single line rendering, without paragraph wrap:
 *
 * ```javascript
 * var md = require('markdown-it')();
 * var result = md.renderInline('__markdown-it__ rulezz!');
 * ```
 **/

/**
 * new MarkdownIt([presetName, options])
 * - presetName (String): optional, `commonmark` / `zero`
 * - options (Object)
 *
 * Creates parser instanse with given config. Can be called without `new`.
 *
 * ##### presetName
 *
 * MarkdownIt provides named presets as a convenience to quickly
 * enable/disable active syntax rules and options for common use cases.
 *
 * - ["commonmark"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/commonmark.js) -
 *   configures parser to strict [CommonMark](http://commonmark.org/) mode.
 * - [default](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/default.js) -
 *   similar to GFM, used when no preset name given. Enables all available rules,
 *   but still without html, typographer & autolinker.
 * - ["zero"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/zero.js) -
 *   all rules disabled. Useful to quickly setup your config via `.enable()`.
 *   For example, when you need only `bold` and `italic` markup and nothing else.
 *
 * ##### options:
 *
 * - __html__ - `false`. Set `true` to enable HTML tags in source. Be careful!
 *   That's not safe! You may need external sanitizer to protect output from XSS.
 *   It's better to extend features via plugins, instead of enabling HTML.
 * - __xhtmlOut__ - `false`. Set `true` to add '/' when closing single tags
 *   (`<br />`). This is needed only for full CommonMark compatibility. In real
 *   world you will need HTML output.
 * - __breaks__ - `false`. Set `true` to convert `\n` in paragraphs into `<br>`.
 * - __langPrefix__ - `language-`. CSS language class prefix for fenced blocks.
 *   Can be useful for external highlighters.
 * - __linkify__ - `false`. Set `true` to autoconvert URL-like text to links.
 * - __typographer__  - `false`. Set `true` to enable [some language-neutral
 *   replacement](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/replacements.js) +
 *   quotes beautification (smartquotes).
 * - __quotes__ - `“”‘’`, String or Array. Double + single quotes replacement
 *   pairs, when typographer enabled and smartquotes on. For example, you can
 *   use `'«»„“'` for Russian, `'„“‚‘'` for German, and
 *   `['«\xA0', '\xA0»', '‹\xA0', '\xA0›']` for French (including nbsp).
 * - __highlight__ - `null`. Highlighter function for fenced code blocks.
 *   Highlighter `function (str, lang)` should return escaped HTML. It can also
 *   return empty string if the source was not changed and should be escaped
 *   externaly. If result starts with <pre... internal wrapper is skipped.
 *
 * ##### Example
 *
 * ```javascript
 * // commonmark mode
 * var md = require('markdown-it')('commonmark');
 *
 * // default mode
 * var md = require('markdown-it')();
 *
 * // enable everything
 * var md = require('markdown-it')({
 *   html: true,
 *   linkify: true,
 *   typographer: true
 * });
 * ```
 *
 * ##### Syntax highlighting
 *
 * ```js
 * var hljs = require('highlight.js') // https://highlightjs.org/
 *
 * var md = require('markdown-it')({
 *   highlight: function (str, lang) {
 *     if (lang && hljs.getLanguage(lang)) {
 *       try {
 *         return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
 *       } catch (__) {}
 *     }
 *
 *     return ''; // use external default escaping
 *   }
 * });
 * ```
 *
 * Or with full wrapper override (if you need assign class to `<pre>`):
 *
 * ```javascript
 * var hljs = require('highlight.js') // https://highlightjs.org/
 *
 * // Actual default values
 * var md = require('markdown-it')({
 *   highlight: function (str, lang) {
 *     if (lang && hljs.getLanguage(lang)) {
 *       try {
 *         return '<pre class="hljs"><code>' +
 *                hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
 *                '</code></pre>';
 *       } catch (__) {}
 *     }
 *
 *     return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
 *   }
 * });
 * ```
 *
 **/
function MarkdownIt(presetName, options) {
  if (!(this instanceof MarkdownIt)) {
    return new MarkdownIt(presetName, options);
  }

  if (!options) {
    if (!utils.isString(presetName)) {
      options = presetName || {};
      presetName = 'default';
    }
  }

  /**
   * MarkdownIt#inline -> ParserInline
   *
   * Instance of [[ParserInline]]. You may need it to add new rules when
   * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
   * [[MarkdownIt.enable]].
   **/
  this.inline = new ParserInline();

  /**
   * MarkdownIt#block -> ParserBlock
   *
   * Instance of [[ParserBlock]]. You may need it to add new rules when
   * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
   * [[MarkdownIt.enable]].
   **/
  this.block = new ParserBlock();

  /**
   * MarkdownIt#core -> Core
   *
   * Instance of [[Core]] chain executor. You may need it to add new rules when
   * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
   * [[MarkdownIt.enable]].
   **/
  this.core = new ParserCore();

  /**
   * MarkdownIt#renderer -> Renderer
   *
   * Instance of [[Renderer]]. Use it to modify output look. Or to add rendering
   * rules for new token types, generated by plugins.
   *
   * ##### Example
   *
   * ```javascript
   * var md = require('markdown-it')();
   *
   * function myToken(tokens, idx, options, env, self) {
   *   //...
   *   return result;
   * };
   *
   * md.renderer.rules['my_token'] = myToken
   * ```
   *
   * See [[Renderer]] docs and [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.js).
   **/
  this.renderer = new Renderer();

  /**
   * MarkdownIt#linkify -> LinkifyIt
   *
   * [linkify-it](https://github.com/markdown-it/linkify-it) instance.
   * Used by [linkify](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/linkify.js)
   * rule.
   **/
  this.linkify = new LinkifyIt();

  /**
   * MarkdownIt#validateLink(url) -> Boolean
   *
   * Link validation function. CommonMark allows too much in links. By default
   * we disable `javascript:`, `vbscript:`, `file:` schemas, and almost all `data:...` schemas
   * except some embedded image types.
   *
   * You can change this behaviour:
   *
   * ```javascript
   * var md = require('markdown-it')();
   * // enable everything
   * md.validateLink = function () { return true; }
   * ```
   **/
  this.validateLink = validateLink;

  /**
   * MarkdownIt#normalizeLink(url) -> String
   *
   * Function used to encode link url to a machine-readable format,
   * which includes url-encoding, punycode, etc.
   **/
  this.normalizeLink = normalizeLink;

  /**
   * MarkdownIt#normalizeLinkText(url) -> String
   *
   * Function used to decode link url to a human-readable format`
   **/
  this.normalizeLinkText = normalizeLinkText;


  // Expose utils & helpers for easy acces from plugins

  /**
   * MarkdownIt#utils -> utils
   *
   * Assorted utility functions, useful to write plugins. See details
   * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/common/utils.js).
   **/
  this.utils = utils;

  /**
   * MarkdownIt#helpers -> helpers
   *
   * Link components parser functions, useful to write plugins. See details
   * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/helpers).
   **/
  this.helpers = utils.assign({}, helpers);


  this.options = {};
  this.configure(presetName);

  if (options) { this.set(options); }
}


/** chainable
 * MarkdownIt.set(options)
 *
 * Set parser options (in the same format as in constructor). Probably, you
 * will never need it, but you can change options after constructor call.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')()
 *             .set({ html: true, breaks: true })
 *             .set({ typographer, true });
 * ```
 *
 * __Note:__ To achieve the best possible performance, don't modify a
 * `markdown-it` instance options on the fly. If you need multiple configurations
 * it's best to create multiple instances and initialize each with separate
 * config.
 **/
MarkdownIt.prototype.set = function (options) {
  utils.assign(this.options, options);
  return this;
};


/** chainable, internal
 * MarkdownIt.configure(presets)
 *
 * Batch load of all options and compenent settings. This is internal method,
 * and you probably will not need it. But if you will - see available presets
 * and data structure [here](https://github.com/markdown-it/markdown-it/tree/master/lib/presets)
 *
 * We strongly recommend to use presets instead of direct config loads. That
 * will give better compatibility with next versions.
 **/
MarkdownIt.prototype.configure = function (presets) {
  var self = this, presetName;

  if (utils.isString(presets)) {
    presetName = presets;
    presets = config[presetName];
    if (!presets) { throw new Error('Wrong `markdown-it` preset "' + presetName + '", check name'); }
  }

  if (!presets) { throw new Error('Wrong `markdown-it` preset, can\'t be empty'); }

  if (presets.options) { self.set(presets.options); }

  if (presets.components) {
    Object.keys(presets.components).forEach(function (name) {
      if (presets.components[name].rules) {
        self[name].ruler.enableOnly(presets.components[name].rules);
      }
      if (presets.components[name].rules2) {
        self[name].ruler2.enableOnly(presets.components[name].rules2);
      }
    });
  }
  return this;
};


/** chainable
 * MarkdownIt.enable(list, ignoreInvalid)
 * - list (String|Array): rule name or list of rule names to enable
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * Enable list or rules. It will automatically find appropriate components,
 * containing rules with given names. If rule not found, and `ignoreInvalid`
 * not set - throws exception.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')()
 *             .enable(['sub', 'sup'])
 *             .disable('smartquotes');
 * ```
 **/
MarkdownIt.prototype.enable = function (list, ignoreInvalid) {
  var result = [];

  if (!Array.isArray(list)) { list = [ list ]; }

  [ 'core', 'block', 'inline' ].forEach(function (chain) {
    result = result.concat(this[chain].ruler.enable(list, true));
  }, this);

  result = result.concat(this.inline.ruler2.enable(list, true));

  var missed = list.filter(function (name) { return result.indexOf(name) < 0; });

  if (missed.length && !ignoreInvalid) {
    throw new Error('MarkdownIt. Failed to enable unknown rule(s): ' + missed);
  }

  return this;
};


/** chainable
 * MarkdownIt.disable(list, ignoreInvalid)
 * - list (String|Array): rule name or list of rule names to disable.
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * The same as [[MarkdownIt.enable]], but turn specified rules off.
 **/
MarkdownIt.prototype.disable = function (list, ignoreInvalid) {
  var result = [];

  if (!Array.isArray(list)) { list = [ list ]; }

  [ 'core', 'block', 'inline' ].forEach(function (chain) {
    result = result.concat(this[chain].ruler.disable(list, true));
  }, this);

  result = result.concat(this.inline.ruler2.disable(list, true));

  var missed = list.filter(function (name) { return result.indexOf(name) < 0; });

  if (missed.length && !ignoreInvalid) {
    throw new Error('MarkdownIt. Failed to disable unknown rule(s): ' + missed);
  }
  return this;
};


/** chainable
 * MarkdownIt.use(plugin, params)
 *
 * Load specified plugin with given params into current parser instance.
 * It's just a sugar to call `plugin(md, params)` with curring.
 *
 * ##### Example
 *
 * ```javascript
 * var iterator = require('markdown-it-for-inline');
 * var md = require('markdown-it')()
 *             .use(iterator, 'foo_replace', 'text', function (tokens, idx) {
 *               tokens[idx].content = tokens[idx].content.replace(/foo/g, 'bar');
 *             });
 * ```
 **/
MarkdownIt.prototype.use = function (plugin /*, params, ... */) {
  var args = [ this ].concat(Array.prototype.slice.call(arguments, 1));
  plugin.apply(plugin, args);
  return this;
};


/** internal
 * MarkdownIt.parse(src, env) -> Array
 * - src (String): source string
 * - env (Object): environment sandbox
 *
 * Parse input string and return list of block tokens (special token type
 * "inline" will contain list of inline tokens). You should not call this
 * method directly, until you write custom renderer (for example, to produce
 * AST).
 *
 * `env` is used to pass data between "distributed" rules and return additional
 * metadata like reference info, needed for the renderer. It also can be used to
 * inject data in specific cases. Usually, you will be ok to pass `{}`,
 * and then pass updated object to renderer.
 **/
MarkdownIt.prototype.parse = function (src, env) {
  if (typeof src !== 'string') {
    throw new Error('Input data should be a String');
  }

  var state = new this.core.State(src, this, env);

  this.core.process(state);

  return state.tokens;
};


/**
 * MarkdownIt.render(src [, env]) -> String
 * - src (String): source string
 * - env (Object): environment sandbox
 *
 * Render markdown string into html. It does all magic for you :).
 *
 * `env` can be used to inject additional metadata (`{}` by default).
 * But you will not need it with high probability. See also comment
 * in [[MarkdownIt.parse]].
 **/
MarkdownIt.prototype.render = function (src, env) {
  env = env || {};

  return this.renderer.render(this.parse(src, env), this.options, env);
};


/** internal
 * MarkdownIt.parseInline(src, env) -> Array
 * - src (String): source string
 * - env (Object): environment sandbox
 *
 * The same as [[MarkdownIt.parse]] but skip all block rules. It returns the
 * block tokens list with the single `inline` element, containing parsed inline
 * tokens in `children` property. Also updates `env` object.
 **/
MarkdownIt.prototype.parseInline = function (src, env) {
  var state = new this.core.State(src, this, env);

  state.inlineMode = true;
  this.core.process(state);

  return state.tokens;
};


/**
 * MarkdownIt.renderInline(src [, env]) -> String
 * - src (String): source string
 * - env (Object): environment sandbox
 *
 * Similar to [[MarkdownIt.render]] but for single paragraph content. Result
 * will NOT be wrapped into `<p>` tags.
 **/
MarkdownIt.prototype.renderInline = function (src, env) {
  env = env || {};

  return this.renderer.render(this.parseInline(src, env), this.options, env);
};


module.exports = MarkdownIt;


/***/ }),

/***/ 2471:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/** internal
 * class ParserBlock
 *
 * Block-level tokenizer.
 **/



var Ruler           = __webpack_require__(9580);


var _rules = [
  // First 2 params - rule name & source. Secondary array - list of rules,
  // which can be terminated by this one.
  [ 'table',      __webpack_require__(1785),      [ 'paragraph', 'reference' ] ],
  [ 'code',       __webpack_require__(8768) ],
  [ 'fence',      __webpack_require__(3542),      [ 'paragraph', 'reference', 'blockquote', 'list' ] ],
  [ 'blockquote', __webpack_require__(5258), [ 'paragraph', 'reference', 'blockquote', 'list' ] ],
  [ 'hr',         __webpack_require__(5634),         [ 'paragraph', 'reference', 'blockquote', 'list' ] ],
  [ 'list',       __webpack_require__(8532),       [ 'paragraph', 'reference', 'blockquote' ] ],
  [ 'reference',  __webpack_require__(3804) ],
  [ 'html_block', __webpack_require__(6329), [ 'paragraph', 'reference', 'blockquote' ] ],
  [ 'heading',    __webpack_require__(1630),    [ 'paragraph', 'reference', 'blockquote' ] ],
  [ 'lheading',   __webpack_require__(6850) ],
  [ 'paragraph',  __webpack_require__(6864) ]
];


/**
 * new ParserBlock()
 **/
function ParserBlock() {
  /**
   * ParserBlock#ruler -> Ruler
   *
   * [[Ruler]] instance. Keep configuration of block rules.
   **/
  this.ruler = new Ruler();

  for (var i = 0; i < _rules.length; i++) {
    this.ruler.push(_rules[i][0], _rules[i][1], { alt: (_rules[i][2] || []).slice() });
  }
}


// Generate tokens for input range
//
ParserBlock.prototype.tokenize = function (state, startLine, endLine) {
  var ok, i,
      rules = this.ruler.getRules(''),
      len = rules.length,
      line = startLine,
      hasEmptyLines = false,
      maxNesting = state.md.options.maxNesting;

  while (line < endLine) {
    state.line = line = state.skipEmptyLines(line);
    if (line >= endLine) { break; }

    // Termination condition for nested calls.
    // Nested calls currently used for blockquotes & lists
    if (state.sCount[line] < state.blkIndent) { break; }

    // If nesting level exceeded - skip tail to the end. That's not ordinary
    // situation and we should not care about content.
    if (state.level >= maxNesting) {
      state.line = endLine;
      break;
    }

    // Try all possible rules.
    // On success, rule should:
    //
    // - update `state.line`
    // - update `state.tokens`
    // - return true

    for (i = 0; i < len; i++) {
      ok = rules[i](state, line, endLine, false);
      if (ok) { break; }
    }

    // set state.tight if we had an empty line before current tag
    // i.e. latest empty line should not count
    state.tight = !hasEmptyLines;

    // paragraph might "eat" one newline after it in nested lists
    if (state.isEmpty(state.line - 1)) {
      hasEmptyLines = true;
    }

    line = state.line;

    if (line < endLine && state.isEmpty(line)) {
      hasEmptyLines = true;
      line++;
      state.line = line;
    }
  }
};


/**
 * ParserBlock.parse(str, md, env, outTokens)
 *
 * Process input string and push block tokens into `outTokens`
 **/
ParserBlock.prototype.parse = function (src, md, env, outTokens) {
  var state;

  if (!src) { return; }

  state = new this.State(src, md, env, outTokens);

  this.tokenize(state, state.line, state.lineMax);
};


ParserBlock.prototype.State = __webpack_require__(2948);


module.exports = ParserBlock;


/***/ }),

/***/ 7346:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/** internal
 * class Core
 *
 * Top-level rules executor. Glues block/inline parsers and does intermediate
 * transformations.
 **/



var Ruler  = __webpack_require__(9580);


var _rules = [
  [ 'normalize',      __webpack_require__(4129)      ],
  [ 'block',          __webpack_require__(898)          ],
  [ 'inline',         __webpack_require__(9827)         ],
  [ 'linkify',        __webpack_require__(7830)        ],
  [ 'replacements',   __webpack_require__(2834)   ],
  [ 'smartquotes',    __webpack_require__(8450)    ],
  // `text_join` finds `text_special` tokens (for escape sequences)
  // and joins them with the rest of the text
  [ 'text_join',      __webpack_require__(6633)      ]
];


/**
 * new Core()
 **/
function Core() {
  /**
   * Core#ruler -> Ruler
   *
   * [[Ruler]] instance. Keep configuration of core rules.
   **/
  this.ruler = new Ruler();

  for (var i = 0; i < _rules.length; i++) {
    this.ruler.push(_rules[i][0], _rules[i][1]);
  }
}


/**
 * Core.process(state)
 *
 * Executes core chain rules.
 **/
Core.prototype.process = function (state) {
  var i, l, rules;

  rules = this.ruler.getRules('');

  for (i = 0, l = rules.length; i < l; i++) {
    rules[i](state);
  }
};

Core.prototype.State = __webpack_require__(6480);


module.exports = Core;


/***/ }),

/***/ 4485:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/** internal
 * class ParserInline
 *
 * Tokenizes paragraph content.
 **/



var Ruler           = __webpack_require__(9580);


////////////////////////////////////////////////////////////////////////////////
// Parser rules

var _rules = [
  [ 'text',            __webpack_require__(9941) ],
  [ 'linkify',         __webpack_require__(2906) ],
  [ 'newline',         __webpack_require__(3905) ],
  [ 'escape',          __webpack_require__(1917) ],
  [ 'backticks',       __webpack_require__(40) ],
  [ 'strikethrough',   (__webpack_require__(4814)/* .tokenize */ .w) ],
  [ 'emphasis',        (__webpack_require__(7894)/* .tokenize */ .w) ],
  [ 'link',            __webpack_require__(1727) ],
  [ 'image',           __webpack_require__(3006) ],
  [ 'autolink',        __webpack_require__(3420) ],
  [ 'html_inline',     __webpack_require__(1779) ],
  [ 'entity',          __webpack_require__(9391) ]
];

// `rule2` ruleset was created specifically for emphasis/strikethrough
// post-processing and may be changed in the future.
//
// Don't use this for anything except pairs (plugins working with `balance_pairs`).
//
var _rules2 = [
  [ 'balance_pairs',   __webpack_require__(9354) ],
  [ 'strikethrough',   (__webpack_require__(4814)/* .postProcess */ .g) ],
  [ 'emphasis',        (__webpack_require__(7894)/* .postProcess */ .g) ],
  // rules for pairs separate '**' into its own text tokens, which may be left unused,
  // rule below merges unused segments back with the rest of the text
  [ 'fragments_join',  __webpack_require__(9969) ]
];


/**
 * new ParserInline()
 **/
function ParserInline() {
  var i;

  /**
   * ParserInline#ruler -> Ruler
   *
   * [[Ruler]] instance. Keep configuration of inline rules.
   **/
  this.ruler = new Ruler();

  for (i = 0; i < _rules.length; i++) {
    this.ruler.push(_rules[i][0], _rules[i][1]);
  }

  /**
   * ParserInline#ruler2 -> Ruler
   *
   * [[Ruler]] instance. Second ruler used for post-processing
   * (e.g. in emphasis-like rules).
   **/
  this.ruler2 = new Ruler();

  for (i = 0; i < _rules2.length; i++) {
    this.ruler2.push(_rules2[i][0], _rules2[i][1]);
  }
}


// Skip single token by running all rules in validation mode;
// returns `true` if any rule reported success
//
ParserInline.prototype.skipToken = function (state) {
  var ok, i, pos = state.pos,
      rules = this.ruler.getRules(''),
      len = rules.length,
      maxNesting = state.md.options.maxNesting,
      cache = state.cache;


  if (typeof cache[pos] !== 'undefined') {
    state.pos = cache[pos];
    return;
  }

  if (state.level < maxNesting) {
    for (i = 0; i < len; i++) {
      // Increment state.level and decrement it later to limit recursion.
      // It's harmless to do here, because no tokens are created. But ideally,
      // we'd need a separate private state variable for this purpose.
      //
      state.level++;
      ok = rules[i](state, true);
      state.level--;

      if (ok) { break; }
    }
  } else {
    // Too much nesting, just skip until the end of the paragraph.
    //
    // NOTE: this will cause links to behave incorrectly in the following case,
    //       when an amount of `[` is exactly equal to `maxNesting + 1`:
    //
    //       [[[[[[[[[[[[[[[[[[[[[foo]()
    //
    // TODO: remove this workaround when CM standard will allow nested links
    //       (we can replace it by preventing links from being parsed in
    //       validation mode)
    //
    state.pos = state.posMax;
  }

  if (!ok) { state.pos++; }
  cache[pos] = state.pos;
};


// Generate tokens for input range
//
ParserInline.prototype.tokenize = function (state) {
  var ok, i,
      rules = this.ruler.getRules(''),
      len = rules.length,
      end = state.posMax,
      maxNesting = state.md.options.maxNesting;

  while (state.pos < end) {
    // Try all possible rules.
    // On success, rule should:
    //
    // - update `state.pos`
    // - update `state.tokens`
    // - return true

    if (state.level < maxNesting) {
      for (i = 0; i < len; i++) {
        ok = rules[i](state, false);
        if (ok) { break; }
      }
    }

    if (ok) {
      if (state.pos >= end) { break; }
      continue;
    }

    state.pending += state.src[state.pos++];
  }

  if (state.pending) {
    state.pushPending();
  }
};


/**
 * ParserInline.parse(str, md, env, outTokens)
 *
 * Process input string and push inline tokens into `outTokens`
 **/
ParserInline.prototype.parse = function (str, md, env, outTokens) {
  var i, rules, len;
  var state = new this.State(str, md, env, outTokens);

  this.tokenize(state);

  rules = this.ruler2.getRules('');
  len = rules.length;

  for (i = 0; i < len; i++) {
    rules[i](state);
  }
};


ParserInline.prototype.State = __webpack_require__(670);


module.exports = ParserInline;


/***/ }),

/***/ 6895:
/***/ ((module) => {

"use strict";
// Commonmark default options




module.exports = {
  options: {
    html:         true,         // Enable HTML tags in source
    xhtmlOut:     true,         // Use '/' to close single tags (<br />)
    breaks:       false,        // Convert '\n' in paragraphs into <br>
    langPrefix:   'language-',  // CSS language prefix for fenced blocks
    linkify:      false,        // autoconvert URL-like texts to links

    // Enable some language-neutral replacements + quotes beautification
    typographer:  false,

    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */

    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,

    maxNesting:   20            // Internal protection, recursion limit
  },

  components: {

    core: {
      rules: [
        'normalize',
        'block',
        'inline',
        'text_join'
      ]
    },

    block: {
      rules: [
        'blockquote',
        'code',
        'fence',
        'heading',
        'hr',
        'html_block',
        'lheading',
        'list',
        'reference',
        'paragraph'
      ]
    },

    inline: {
      rules: [
        'autolink',
        'backticks',
        'emphasis',
        'entity',
        'escape',
        'html_inline',
        'image',
        'link',
        'newline',
        'text'
      ],
      rules2: [
        'balance_pairs',
        'emphasis',
        'fragments_join'
      ]
    }
  }
};


/***/ }),

/***/ 4218:
/***/ ((module) => {

"use strict";
// markdown-it default options




module.exports = {
  options: {
    html:         false,        // Enable HTML tags in source
    xhtmlOut:     false,        // Use '/' to close single tags (<br />)
    breaks:       false,        // Convert '\n' in paragraphs into <br>
    langPrefix:   'language-',  // CSS language prefix for fenced blocks
    linkify:      false,        // autoconvert URL-like texts to links

    // Enable some language-neutral replacements + quotes beautification
    typographer:  false,

    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */

    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,

    maxNesting:   100            // Internal protection, recursion limit
  },

  components: {

    core: {},
    block: {},
    inline: {}
  }
};


/***/ }),

/***/ 873:
/***/ ((module) => {

"use strict";
// "Zero" preset, with nothing enabled. Useful for manual configuring of simple
// modes. For example, to parse bold/italic only.




module.exports = {
  options: {
    html:         false,        // Enable HTML tags in source
    xhtmlOut:     false,        // Use '/' to close single tags (<br />)
    breaks:       false,        // Convert '\n' in paragraphs into <br>
    langPrefix:   'language-',  // CSS language prefix for fenced blocks
    linkify:      false,        // autoconvert URL-like texts to links

    // Enable some language-neutral replacements + quotes beautification
    typographer:  false,

    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */

    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,

    maxNesting:   20            // Internal protection, recursion limit
  },

  components: {

    core: {
      rules: [
        'normalize',
        'block',
        'inline',
        'text_join'
      ]
    },

    block: {
      rules: [
        'paragraph'
      ]
    },

    inline: {
      rules: [
        'text'
      ],
      rules2: [
        'balance_pairs',
        'fragments_join'
      ]
    }
  }
};


/***/ }),

/***/ 7529:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/**
 * class Renderer
 *
 * Generates HTML from parsed token stream. Each instance has independent
 * copy of rules. Those can be rewritten with ease. Also, you can add new
 * rules if you create plugin and adds new token types.
 **/



var assign          = (__webpack_require__(7022).assign);
var unescapeAll     = (__webpack_require__(7022).unescapeAll);
var escapeHtml      = (__webpack_require__(7022).escapeHtml);


////////////////////////////////////////////////////////////////////////////////

var default_rules = {};


default_rules.code_inline = function (tokens, idx, options, env, slf) {
  var token = tokens[idx];

  return  '<code' + slf.renderAttrs(token) + '>' +
          escapeHtml(tokens[idx].content) +
          '</code>';
};


default_rules.code_block = function (tokens, idx, options, env, slf) {
  var token = tokens[idx];

  return  '<pre' + slf.renderAttrs(token) + '><code>' +
          escapeHtml(tokens[idx].content) +
          '</code></pre>\n';
};


default_rules.fence = function (tokens, idx, options, env, slf) {
  var token = tokens[idx],
      info = token.info ? unescapeAll(token.info).trim() : '',
      langName = '',
      langAttrs = '',
      highlighted, i, arr, tmpAttrs, tmpToken;

  if (info) {
    arr = info.split(/(\s+)/g);
    langName = arr[0];
    langAttrs = arr.slice(2).join('');
  }

  if (options.highlight) {
    highlighted = options.highlight(token.content, langName, langAttrs) || escapeHtml(token.content);
  } else {
    highlighted = escapeHtml(token.content);
  }

  if (highlighted.indexOf('<pre') === 0) {
    return highlighted + '\n';
  }

  // If language exists, inject class gently, without modifying original token.
  // May be, one day we will add .deepClone() for token and simplify this part, but
  // now we prefer to keep things local.
  if (info) {
    i        = token.attrIndex('class');
    tmpAttrs = token.attrs ? token.attrs.slice() : [];

    if (i < 0) {
      tmpAttrs.push([ 'class', options.langPrefix + langName ]);
    } else {
      tmpAttrs[i] = tmpAttrs[i].slice();
      tmpAttrs[i][1] += ' ' + options.langPrefix + langName;
    }

    // Fake token just to render attributes
    tmpToken = {
      attrs: tmpAttrs
    };

    return  '<pre><code' + slf.renderAttrs(tmpToken) + '>'
          + highlighted
          + '</code></pre>\n';
  }


  return  '<pre><code' + slf.renderAttrs(token) + '>'
        + highlighted
        + '</code></pre>\n';
};


default_rules.image = function (tokens, idx, options, env, slf) {
  var token = tokens[idx];

  // "alt" attr MUST be set, even if empty. Because it's mandatory and
  // should be placed on proper position for tests.
  //
  // Replace content with actual value

  token.attrs[token.attrIndex('alt')][1] =
    slf.renderInlineAsText(token.children, options, env);

  return slf.renderToken(tokens, idx, options);
};


default_rules.hardbreak = function (tokens, idx, options /*, env */) {
  return options.xhtmlOut ? '<br />\n' : '<br>\n';
};
default_rules.softbreak = function (tokens, idx, options /*, env */) {
  return options.breaks ? (options.xhtmlOut ? '<br />\n' : '<br>\n') : '\n';
};


default_rules.text = function (tokens, idx /*, options, env */) {
  return escapeHtml(tokens[idx].content);
};


default_rules.html_block = function (tokens, idx /*, options, env */) {
  return tokens[idx].content;
};
default_rules.html_inline = function (tokens, idx /*, options, env */) {
  return tokens[idx].content;
};


/**
 * new Renderer()
 *
 * Creates new [[Renderer]] instance and fill [[Renderer#rules]] with defaults.
 **/
function Renderer() {

  /**
   * Renderer#rules -> Object
   *
   * Contains render rules for tokens. Can be updated and extended.
   *
   * ##### Example
   *
   * ```javascript
   * var md = require('markdown-it')();
   *
   * md.renderer.rules.strong_open  = function () { return '<b>'; };
   * md.renderer.rules.strong_close = function () { return '</b>'; };
   *
   * var result = md.renderInline(...);
   * ```
   *
   * Each rule is called as independent static function with fixed signature:
   *
   * ```javascript
   * function my_token_render(tokens, idx, options, env, renderer) {
   *   // ...
   *   return renderedHTML;
   * }
   * ```
   *
   * See [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.js)
   * for more details and examples.
   **/
  this.rules = assign({}, default_rules);
}


/**
 * Renderer.renderAttrs(token) -> String
 *
 * Render token attributes to string.
 **/
Renderer.prototype.renderAttrs = function renderAttrs(token) {
  var i, l, result;

  if (!token.attrs) { return ''; }

  result = '';

  for (i = 0, l = token.attrs.length; i < l; i++) {
    result += ' ' + escapeHtml(token.attrs[i][0]) + '="' + escapeHtml(token.attrs[i][1]) + '"';
  }

  return result;
};


/**
 * Renderer.renderToken(tokens, idx, options) -> String
 * - tokens (Array): list of tokens
 * - idx (Numbed): token index to render
 * - options (Object): params of parser instance
 *
 * Default token renderer. Can be overriden by custom function
 * in [[Renderer#rules]].
 **/
Renderer.prototype.renderToken = function renderToken(tokens, idx, options) {
  var nextToken,
      result = '',
      needLf = false,
      token = tokens[idx];

  // Tight list paragraphs
  if (token.hidden) {
    return '';
  }

  // Insert a newline between hidden paragraph and subsequent opening
  // block-level tag.
  //
  // For example, here we should insert a newline before blockquote:
  //  - a
  //    >
  //
  if (token.block && token.nesting !== -1 && idx && tokens[idx - 1].hidden) {
    result += '\n';
  }

  // Add token name, e.g. `<img`
  result += (token.nesting === -1 ? '</' : '<') + token.tag;

  // Encode attributes, e.g. `<img src="foo"`
  result += this.renderAttrs(token);

  // Add a slash for self-closing tags, e.g. `<img src="foo" /`
  if (token.nesting === 0 && options.xhtmlOut) {
    result += ' /';
  }

  // Check if we need to add a newline after this tag
  if (token.block) {
    needLf = true;

    if (token.nesting === 1) {
      if (idx + 1 < tokens.length) {
        nextToken = tokens[idx + 1];

        if (nextToken.type === 'inline' || nextToken.hidden) {
          // Block-level tag containing an inline tag.
          //
          needLf = false;

        } else if (nextToken.nesting === -1 && nextToken.tag === token.tag) {
          // Opening tag + closing tag of the same type. E.g. `<li></li>`.
          //
          needLf = false;
        }
      }
    }
  }

  result += needLf ? '>\n' : '>';

  return result;
};


/**
 * Renderer.renderInline(tokens, options, env) -> String
 * - tokens (Array): list on block tokens to render
 * - options (Object): params of parser instance
 * - env (Object): additional data from parsed input (references, for example)
 *
 * The same as [[Renderer.render]], but for single token of `inline` type.
 **/
Renderer.prototype.renderInline = function (tokens, options, env) {
  var type,
      result = '',
      rules = this.rules;

  for (var i = 0, len = tokens.length; i < len; i++) {
    type = tokens[i].type;

    if (typeof rules[type] !== 'undefined') {
      result += rules[type](tokens, i, options, env, this);
    } else {
      result += this.renderToken(tokens, i, options);
    }
  }

  return result;
};


/** internal
 * Renderer.renderInlineAsText(tokens, options, env) -> String
 * - tokens (Array): list on block tokens to render
 * - options (Object): params of parser instance
 * - env (Object): additional data from parsed input (references, for example)
 *
 * Special kludge for image `alt` attributes to conform CommonMark spec.
 * Don't try to use it! Spec requires to show `alt` content with stripped markup,
 * instead of simple escaping.
 **/
Renderer.prototype.renderInlineAsText = function (tokens, options, env) {
  var result = '';

  for (var i = 0, len = tokens.length; i < len; i++) {
    if (tokens[i].type === 'text') {
      result += tokens[i].content;
    } else if (tokens[i].type === 'image') {
      result += this.renderInlineAsText(tokens[i].children, options, env);
    } else if (tokens[i].type === 'softbreak') {
      result += '\n';
    }
  }

  return result;
};


/**
 * Renderer.render(tokens, options, env) -> String
 * - tokens (Array): list on block tokens to render
 * - options (Object): params of parser instance
 * - env (Object): additional data from parsed input (references, for example)
 *
 * Takes token stream and generates HTML. Probably, you will never need to call
 * this method directly.
 **/
Renderer.prototype.render = function (tokens, options, env) {
  var i, len, type,
      result = '',
      rules = this.rules;

  for (i = 0, len = tokens.length; i < len; i++) {
    type = tokens[i].type;

    if (type === 'inline') {
      result += this.renderInline(tokens[i].children, options, env);
    } else if (typeof rules[type] !== 'undefined') {
      result += rules[tokens[i].type](tokens, i, options, env, this);
    } else {
      result += this.renderToken(tokens, i, options, env);
    }
  }

  return result;
};

module.exports = Renderer;


/***/ }),

/***/ 9580:
/***/ ((module) => {

"use strict";
/**
 * class Ruler
 *
 * Helper class, used by [[MarkdownIt#core]], [[MarkdownIt#block]] and
 * [[MarkdownIt#inline]] to manage sequences of functions (rules):
 *
 * - keep rules in defined order
 * - assign the name to each rule
 * - enable/disable rules
 * - add/replace rules
 * - allow assign rules to additional named chains (in the same)
 * - cacheing lists of active rules
 *
 * You will not need use this class directly until write plugins. For simple
 * rules control use [[MarkdownIt.disable]], [[MarkdownIt.enable]] and
 * [[MarkdownIt.use]].
 **/



/**
 * new Ruler()
 **/
function Ruler() {
  // List of added rules. Each element is:
  //
  // {
  //   name: XXX,
  //   enabled: Boolean,
  //   fn: Function(),
  //   alt: [ name2, name3 ]
  // }
  //
  this.__rules__ = [];

  // Cached rule chains.
  //
  // First level - chain name, '' for default.
  // Second level - diginal anchor for fast filtering by charcodes.
  //
  this.__cache__ = null;
}

////////////////////////////////////////////////////////////////////////////////
// Helper methods, should not be used directly


// Find rule index by name
//
Ruler.prototype.__find__ = function (name) {
  for (var i = 0; i < this.__rules__.length; i++) {
    if (this.__rules__[i].name === name) {
      return i;
    }
  }
  return -1;
};


// Build rules lookup cache
//
Ruler.prototype.__compile__ = function () {
  var self = this;
  var chains = [ '' ];

  // collect unique names
  self.__rules__.forEach(function (rule) {
    if (!rule.enabled) { return; }

    rule.alt.forEach(function (altName) {
      if (chains.indexOf(altName) < 0) {
        chains.push(altName);
      }
    });
  });

  self.__cache__ = {};

  chains.forEach(function (chain) {
    self.__cache__[chain] = [];
    self.__rules__.forEach(function (rule) {
      if (!rule.enabled) { return; }

      if (chain && rule.alt.indexOf(chain) < 0) { return; }

      self.__cache__[chain].push(rule.fn);
    });
  });
};


/**
 * Ruler.at(name, fn [, options])
 * - name (String): rule name to replace.
 * - fn (Function): new rule function.
 * - options (Object): new rule options (not mandatory).
 *
 * Replace rule by name with new function & options. Throws error if name not
 * found.
 *
 * ##### Options:
 *
 * - __alt__ - array with names of "alternate" chains.
 *
 * ##### Example
 *
 * Replace existing typographer replacement rule with new one:
 *
 * ```javascript
 * var md = require('markdown-it')();
 *
 * md.core.ruler.at('replacements', function replace(state) {
 *   //...
 * });
 * ```
 **/
Ruler.prototype.at = function (name, fn, options) {
  var index = this.__find__(name);
  var opt = options || {};

  if (index === -1) { throw new Error('Parser rule not found: ' + name); }

  this.__rules__[index].fn = fn;
  this.__rules__[index].alt = opt.alt || [];
  this.__cache__ = null;
};


/**
 * Ruler.before(beforeName, ruleName, fn [, options])
 * - beforeName (String): new rule will be added before this one.
 * - ruleName (String): name of added rule.
 * - fn (Function): rule function.
 * - options (Object): rule options (not mandatory).
 *
 * Add new rule to chain before one with given name. See also
 * [[Ruler.after]], [[Ruler.push]].
 *
 * ##### Options:
 *
 * - __alt__ - array with names of "alternate" chains.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')();
 *
 * md.block.ruler.before('paragraph', 'my_rule', function replace(state) {
 *   //...
 * });
 * ```
 **/
Ruler.prototype.before = function (beforeName, ruleName, fn, options) {
  var index = this.__find__(beforeName);
  var opt = options || {};

  if (index === -1) { throw new Error('Parser rule not found: ' + beforeName); }

  this.__rules__.splice(index, 0, {
    name: ruleName,
    enabled: true,
    fn: fn,
    alt: opt.alt || []
  });

  this.__cache__ = null;
};


/**
 * Ruler.after(afterName, ruleName, fn [, options])
 * - afterName (String): new rule will be added after this one.
 * - ruleName (String): name of added rule.
 * - fn (Function): rule function.
 * - options (Object): rule options (not mandatory).
 *
 * Add new rule to chain after one with given name. See also
 * [[Ruler.before]], [[Ruler.push]].
 *
 * ##### Options:
 *
 * - __alt__ - array with names of "alternate" chains.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')();
 *
 * md.inline.ruler.after('text', 'my_rule', function replace(state) {
 *   //...
 * });
 * ```
 **/
Ruler.prototype.after = function (afterName, ruleName, fn, options) {
  var index = this.__find__(afterName);
  var opt = options || {};

  if (index === -1) { throw new Error('Parser rule not found: ' + afterName); }

  this.__rules__.splice(index + 1, 0, {
    name: ruleName,
    enabled: true,
    fn: fn,
    alt: opt.alt || []
  });

  this.__cache__ = null;
};

/**
 * Ruler.push(ruleName, fn [, options])
 * - ruleName (String): name of added rule.
 * - fn (Function): rule function.
 * - options (Object): rule options (not mandatory).
 *
 * Push new rule to the end of chain. See also
 * [[Ruler.before]], [[Ruler.after]].
 *
 * ##### Options:
 *
 * - __alt__ - array with names of "alternate" chains.
 *
 * ##### Example
 *
 * ```javascript
 * var md = require('markdown-it')();
 *
 * md.core.ruler.push('my_rule', function replace(state) {
 *   //...
 * });
 * ```
 **/
Ruler.prototype.push = function (ruleName, fn, options) {
  var opt = options || {};

  this.__rules__.push({
    name: ruleName,
    enabled: true,
    fn: fn,
    alt: opt.alt || []
  });

  this.__cache__ = null;
};


/**
 * Ruler.enable(list [, ignoreInvalid]) -> Array
 * - list (String|Array): list of rule names to enable.
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * Enable rules with given names. If any rule name not found - throw Error.
 * Errors can be disabled by second param.
 *
 * Returns list of found rule names (if no exception happened).
 *
 * See also [[Ruler.disable]], [[Ruler.enableOnly]].
 **/
Ruler.prototype.enable = function (list, ignoreInvalid) {
  if (!Array.isArray(list)) { list = [ list ]; }

  var result = [];

  // Search by name and enable
  list.forEach(function (name) {
    var idx = this.__find__(name);

    if (idx < 0) {
      if (ignoreInvalid) { return; }
      throw new Error('Rules manager: invalid rule name ' + name);
    }
    this.__rules__[idx].enabled = true;
    result.push(name);
  }, this);

  this.__cache__ = null;
  return result;
};


/**
 * Ruler.enableOnly(list [, ignoreInvalid])
 * - list (String|Array): list of rule names to enable (whitelist).
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * Enable rules with given names, and disable everything else. If any rule name
 * not found - throw Error. Errors can be disabled by second param.
 *
 * See also [[Ruler.disable]], [[Ruler.enable]].
 **/
Ruler.prototype.enableOnly = function (list, ignoreInvalid) {
  if (!Array.isArray(list)) { list = [ list ]; }

  this.__rules__.forEach(function (rule) { rule.enabled = false; });

  this.enable(list, ignoreInvalid);
};


/**
 * Ruler.disable(list [, ignoreInvalid]) -> Array
 * - list (String|Array): list of rule names to disable.
 * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
 *
 * Disable rules with given names. If any rule name not found - throw Error.
 * Errors can be disabled by second param.
 *
 * Returns list of found rule names (if no exception happened).
 *
 * See also [[Ruler.enable]], [[Ruler.enableOnly]].
 **/
Ruler.prototype.disable = function (list, ignoreInvalid) {
  if (!Array.isArray(list)) { list = [ list ]; }

  var result = [];

  // Search by name and disable
  list.forEach(function (name) {
    var idx = this.__find__(name);

    if (idx < 0) {
      if (ignoreInvalid) { return; }
      throw new Error('Rules manager: invalid rule name ' + name);
    }
    this.__rules__[idx].enabled = false;
    result.push(name);
  }, this);

  this.__cache__ = null;
  return result;
};


/**
 * Ruler.getRules(chainName) -> Array
 *
 * Return array of active functions (rules) for given chain name. It analyzes
 * rules configuration, compiles caches if not exists and returns result.
 *
 * Default chain name is `''` (empty string). It can't be skipped. That's
 * done intentionally, to keep signature monomorphic for high speed.
 **/
Ruler.prototype.getRules = function (chainName) {
  if (this.__cache__ === null) {
    this.__compile__();
  }

  // Chain can be empty, if rules disabled. But we still have to return Array.
  return this.__cache__[chainName] || [];
};

module.exports = Ruler;


/***/ }),

/***/ 5258:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Block quotes



var isSpace = (__webpack_require__(7022).isSpace);


module.exports = function blockquote(state, startLine, endLine, silent) {
  var adjustTab,
      ch,
      i,
      initial,
      l,
      lastLineEmpty,
      lines,
      nextLine,
      offset,
      oldBMarks,
      oldBSCount,
      oldIndent,
      oldParentType,
      oldSCount,
      oldTShift,
      spaceAfterMarker,
      terminate,
      terminatorRules,
      token,
      isOutdented,
      oldLineMax = state.lineMax,
      pos = state.bMarks[startLine] + state.tShift[startLine],
      max = state.eMarks[startLine];

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

  // check the block quote marker
  if (state.src.charCodeAt(pos++) !== 0x3E/* > */) { return false; }

  // we know that it's going to be a valid blockquote,
  // so no point trying to find the end of it in silent mode
  if (silent) { return true; }

  // set offset past spaces and ">"
  initial = offset = state.sCount[startLine] + 1;

  // skip one optional space after '>'
  if (state.src.charCodeAt(pos) === 0x20 /* space */) {
    // ' >   test '
    //     ^ -- position start of line here:
    pos++;
    initial++;
    offset++;
    adjustTab = false;
    spaceAfterMarker = true;
  } else if (state.src.charCodeAt(pos) === 0x09 /* tab */) {
    spaceAfterMarker = true;

    if ((state.bsCount[startLine] + offset) % 4 === 3) {
      // '  >\t  test '
      //       ^ -- position start of line here (tab has width===1)
      pos++;
      initial++;
      offset++;
      adjustTab = false;
    } else {
      // ' >\t  test '
      //    ^ -- position start of line here + shift bsCount slightly
      //         to make extra space appear
      adjustTab = true;
    }
  } else {
    spaceAfterMarker = false;
  }

  oldBMarks = [ state.bMarks[startLine] ];
  state.bMarks[startLine] = pos;

  while (pos < max) {
    ch = state.src.charCodeAt(pos);

    if (isSpace(ch)) {
      if (ch === 0x09) {
        offset += 4 - (offset + state.bsCount[startLine] + (adjustTab ? 1 : 0)) % 4;
      } else {
        offset++;
      }
    } else {
      break;
    }

    pos++;
  }

  oldBSCount = [ state.bsCount[startLine] ];
  state.bsCount[startLine] = state.sCount[startLine] + 1 + (spaceAfterMarker ? 1 : 0);

  lastLineEmpty = pos >= max;

  oldSCount = [ state.sCount[startLine] ];
  state.sCount[startLine] = offset - initial;

  oldTShift = [ state.tShift[startLine] ];
  state.tShift[startLine] = pos - state.bMarks[startLine];

  terminatorRules = state.md.block.ruler.getRules('blockquote');

  oldParentType = state.parentType;
  state.parentType = 'blockquote';

  // Search the end of the block
  //
  // Block ends with either:
  //  1. an empty line outside:
  //     ```
  //     > test
  //
  //     ```
  //  2. an empty line inside:
  //     ```
  //     >
  //     test
  //     ```
  //  3. another tag:
  //     ```
  //     > test
  //      - - -
  //     ```
  for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
    // check if it's outdented, i.e. it's inside list item and indented
    // less than said list item:
    //
    // ```
    // 1. anything
    //    > current blockquote
    // 2. checking this line
    // ```
    isOutdented = state.sCount[nextLine] < state.blkIndent;

    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];

    if (pos >= max) {
      // Case 1: line is not inside the blockquote, and this line is empty.
      break;
    }

    if (state.src.charCodeAt(pos++) === 0x3E/* > */ && !isOutdented) {
      // This line is inside the blockquote.

      // set offset past spaces and ">"
      initial = offset = state.sCount[nextLine] + 1;

      // skip one optional space after '>'
      if (state.src.charCodeAt(pos) === 0x20 /* space */) {
        // ' >   test '
        //     ^ -- position start of line here:
        pos++;
        initial++;
        offset++;
        adjustTab = false;
        spaceAfterMarker = true;
      } else if (state.src.charCodeAt(pos) === 0x09 /* tab */) {
        spaceAfterMarker = true;

        if ((state.bsCount[nextLine] + offset) % 4 === 3) {
          // '  >\t  test '
          //       ^ -- position start of line here (tab has width===1)
          pos++;
          initial++;
          offset++;
          adjustTab = false;
        } else {
          // ' >\t  test '
          //    ^ -- position start of line here + shift bsCount slightly
          //         to make extra space appear
          adjustTab = true;
        }
      } else {
        spaceAfterMarker = false;
      }

      oldBMarks.push(state.bMarks[nextLine]);
      state.bMarks[nextLine] = pos;

      while (pos < max) {
        ch = state.src.charCodeAt(pos);

        if (isSpace(ch)) {
          if (ch === 0x09) {
            offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
          } else {
            offset++;
          }
        } else {
          break;
        }

        pos++;
      }

      lastLineEmpty = pos >= max;

      oldBSCount.push(state.bsCount[nextLine]);
      state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);

      oldSCount.push(state.sCount[nextLine]);
      state.sCount[nextLine] = offset - initial;

      oldTShift.push(state.tShift[nextLine]);
      state.tShift[nextLine] = pos - state.bMarks[nextLine];
      continue;
    }

    // Case 2: line is not inside the blockquote, and the last line was empty.
    if (lastLineEmpty) { break; }

    // Case 3: another tag found.
    terminate = false;
    for (i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }

    if (terminate) {
      // Quirk to enforce "hard termination mode" for paragraphs;
      // normally if you call `tokenize(state, startLine, nextLine)`,
      // paragraphs will look below nextLine for paragraph continuation,
      // but if blockquote is terminated by another tag, they shouldn't
      state.lineMax = nextLine;

      if (state.blkIndent !== 0) {
        // state.blkIndent was non-zero, we now set it to zero,
        // so we need to re-calculate all offsets to appear as
        // if indent wasn't changed
        oldBMarks.push(state.bMarks[nextLine]);
        oldBSCount.push(state.bsCount[nextLine]);
        oldTShift.push(state.tShift[nextLine]);
        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] -= state.blkIndent;
      }

      break;
    }

    oldBMarks.push(state.bMarks[nextLine]);
    oldBSCount.push(state.bsCount[nextLine]);
    oldTShift.push(state.tShift[nextLine]);
    oldSCount.push(state.sCount[nextLine]);

    // A negative indentation means that this is a paragraph continuation
    //
    state.sCount[nextLine] = -1;
  }

  oldIndent = state.blkIndent;
  state.blkIndent = 0;

  token        = state.push('blockquote_open', 'blockquote', 1);
  token.markup = '>';
  token.map    = lines = [ startLine, 0 ];

  state.md.block.tokenize(state, startLine, nextLine);

  token        = state.push('blockquote_close', 'blockquote', -1);
  token.markup = '>';

  state.lineMax = oldLineMax;
  state.parentType = oldParentType;
  lines[1] = state.line;

  // Restore original tShift; this might not be necessary since the parser
  // has already been here, but just to make sure we can do that.
  for (i = 0; i < oldTShift.length; i++) {
    state.bMarks[i + startLine] = oldBMarks[i];
    state.tShift[i + startLine] = oldTShift[i];
    state.sCount[i + startLine] = oldSCount[i];
    state.bsCount[i + startLine] = oldBSCount[i];
  }
  state.blkIndent = oldIndent;

  return true;
};


/***/ }),

/***/ 8768:
/***/ ((module) => {

"use strict";
// Code block (4 spaces padded)




module.exports = function code(state, startLine, endLine/*, silent*/) {
  var nextLine, last, token;

  if (state.sCount[startLine] - state.blkIndent < 4) { return false; }

  last = nextLine = startLine + 1;

  while (nextLine < endLine) {
    if (state.isEmpty(nextLine)) {
      nextLine++;
      continue;
    }

    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      nextLine++;
      last = nextLine;
      continue;
    }
    break;
  }

  state.line = last;

  token         = state.push('code_block', 'code', 0);
  token.content = state.getLines(startLine, last, 4 + state.blkIndent, false) + '\n';
  token.map     = [ startLine, state.line ];

  return true;
};


/***/ }),

/***/ 3542:
/***/ ((module) => {

"use strict";
// fences (``` lang, ~~~ lang)




module.exports = function fence(state, startLine, endLine, silent) {
  var marker, len, params, nextLine, mem, token, markup,
      haveEndMarker = false,
      pos = state.bMarks[startLine] + state.tShift[startLine],
      max = state.eMarks[startLine];

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

  if (pos + 3 > max) { return false; }

  marker = state.src.charCodeAt(pos);

  if (marker !== 0x7E/* ~ */ && marker !== 0x60 /* ` */) {
    return false;
  }

  // scan marker length
  mem = pos;
  pos = state.skipChars(pos, marker);

  len = pos - mem;

  if (len < 3) { return false; }

  markup = state.src.slice(mem, pos);
  params = state.src.slice(pos, max);

  if (marker === 0x60 /* ` */) {
    if (params.indexOf(String.fromCharCode(marker)) >= 0) {
      return false;
    }
  }

  // Since start is found, we can report success here in validation mode
  if (silent) { return true; }

  // search end of block
  nextLine = startLine;

  for (;;) {
    nextLine++;
    if (nextLine >= endLine) {
      // unclosed block should be autoclosed by end of document.
      // also block seems to be autoclosed by end of parent
      break;
    }

    pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];

    if (pos < max && state.sCount[nextLine] < state.blkIndent) {
      // non-empty line with negative indent should stop the list:
      // - ```
      //  test
      break;
    }

    if (state.src.charCodeAt(pos) !== marker) { continue; }

    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      // closing fence should be indented less than 4 spaces
      continue;
    }

    pos = state.skipChars(pos, marker);

    // closing code fence must be at least as long as the opening one
    if (pos - mem < len) { continue; }

    // make sure tail has spaces only
    pos = state.skipSpaces(pos);

    if (pos < max) { continue; }

    haveEndMarker = true;
    // found!
    break;
  }

  // If a fence has heading spaces, they should be removed from its inner block
  len = state.sCount[startLine];

  state.line = nextLine + (haveEndMarker ? 1 : 0);

  token         = state.push('fence', 'code', 0);
  token.info    = params;
  token.content = state.getLines(startLine + 1, nextLine, len, true);
  token.markup  = markup;
  token.map     = [ startLine, state.line ];

  return true;
};


/***/ }),

/***/ 1630:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// heading (#, ##, ...)



var isSpace = (__webpack_require__(7022).isSpace);


module.exports = function heading(state, startLine, endLine, silent) {
  var ch, level, tmp, token,
      pos = state.bMarks[startLine] + state.tShift[startLine],
      max = state.eMarks[startLine];

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

  ch  = state.src.charCodeAt(pos);

  if (ch !== 0x23/* # */ || pos >= max) { return false; }

  // count heading level
  level = 1;
  ch = state.src.charCodeAt(++pos);
  while (ch === 0x23/* # */ && pos < max && level <= 6) {
    level++;
    ch = state.src.charCodeAt(++pos);
  }

  if (level > 6 || (pos < max && !isSpace(ch))) { return false; }

  if (silent) { return true; }

  // Let's cut tails like '    ###  ' from the end of string

  max = state.skipSpacesBack(max, pos);
  tmp = state.skipCharsBack(max, 0x23, pos); // #
  if (tmp > pos && isSpace(state.src.charCodeAt(tmp - 1))) {
    max = tmp;
  }

  state.line = startLine + 1;

  token        = state.push('heading_open', 'h' + String(level), 1);
  token.markup = '########'.slice(0, level);
  token.map    = [ startLine, state.line ];

  token          = state.push('inline', '', 0);
  token.content  = state.src.slice(pos, max).trim();
  token.map      = [ startLine, state.line ];
  token.children = [];

  token        = state.push('heading_close', 'h' + String(level), -1);
  token.markup = '########'.slice(0, level);

  return true;
};


/***/ }),

/***/ 5634:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Horizontal rule



var isSpace = (__webpack_require__(7022).isSpace);


module.exports = function hr(state, startLine, endLine, silent) {
  var marker, cnt, ch, token,
      pos = state.bMarks[startLine] + state.tShift[startLine],
      max = state.eMarks[startLine];

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

  marker = state.src.charCodeAt(pos++);

  // Check hr marker
  if (marker !== 0x2A/* * */ &&
      marker !== 0x2D/* - */ &&
      marker !== 0x5F/* _ */) {
    return false;
  }

  // markers can be mixed with spaces, but there should be at least 3 of them

  cnt = 1;
  while (pos < max) {
    ch = state.src.charCodeAt(pos++);
    if (ch !== marker && !isSpace(ch)) { return false; }
    if (ch === marker) { cnt++; }
  }

  if (cnt < 3) { return false; }

  if (silent) { return true; }

  state.line = startLine + 1;

  token        = state.push('hr', 'hr', 0);
  token.map    = [ startLine, state.line ];
  token.markup = Array(cnt + 1).join(String.fromCharCode(marker));

  return true;
};


/***/ }),

/***/ 6329:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// HTML block




var block_names = __webpack_require__(813);
var HTML_OPEN_CLOSE_TAG_RE = (__webpack_require__(1947)/* .HTML_OPEN_CLOSE_TAG_RE */ .q);

// An array of opening and corresponding closing sequences for html tags,
// last argument defines whether it can terminate a paragraph or not
//
var HTML_SEQUENCES = [
  [ /^<(script|pre|style|textarea)(?=(\s|>|$))/i, /<\/(script|pre|style|textarea)>/i, true ],
  [ /^<!--/,        /-->/,   true ],
  [ /^<\?/,         /\?>/,   true ],
  [ /^<![A-Z]/,     />/,     true ],
  [ /^<!\[CDATA\[/, /\]\]>/, true ],
  [ new RegExp('^</?(' + block_names.join('|') + ')(?=(\\s|/?>|$))', 'i'), /^$/, true ],
  [ new RegExp(HTML_OPEN_CLOSE_TAG_RE.source + '\\s*$'),  /^$/, false ]
];


module.exports = function html_block(state, startLine, endLine, silent) {
  var i, nextLine, token, lineText,
      pos = state.bMarks[startLine] + state.tShift[startLine],
      max = state.eMarks[startLine];

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

  if (!state.md.options.html) { return false; }

  if (state.src.charCodeAt(pos) !== 0x3C/* < */) { return false; }

  lineText = state.src.slice(pos, max);

  for (i = 0; i < HTML_SEQUENCES.length; i++) {
    if (HTML_SEQUENCES[i][0].test(lineText)) { break; }
  }

  if (i === HTML_SEQUENCES.length) { return false; }

  if (silent) {
    // true if this sequence can be a terminator, false otherwise
    return HTML_SEQUENCES[i][2];
  }

  nextLine = startLine + 1;

  // If we are here - we detected HTML block.
  // Let's roll down till block end.
  if (!HTML_SEQUENCES[i][1].test(lineText)) {
    for (; nextLine < endLine; nextLine++) {
      if (state.sCount[nextLine] < state.blkIndent) { break; }

      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      lineText = state.src.slice(pos, max);

      if (HTML_SEQUENCES[i][1].test(lineText)) {
        if (lineText.length !== 0) { nextLine++; }
        break;
      }
    }
  }

  state.line = nextLine;

  token         = state.push('html_block', '', 0);
  token.map     = [ startLine, nextLine ];
  token.content = state.getLines(startLine, nextLine, state.blkIndent, true);

  return true;
};


/***/ }),

/***/ 6850:
/***/ ((module) => {

"use strict";
// lheading (---, ===)




module.exports = function lheading(state, startLine, endLine/*, silent*/) {
  var content, terminate, i, l, token, pos, max, level, marker,
      nextLine = startLine + 1, oldParentType,
      terminatorRules = state.md.block.ruler.getRules('paragraph');

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

  oldParentType = state.parentType;
  state.parentType = 'paragraph'; // use paragraph to match terminatorRules

  // jump line-by-line until empty one or EOF
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    // this would be a code block normally, but after paragraph
    // it's considered a lazy continuation regardless of what's there
    if (state.sCount[nextLine] - state.blkIndent > 3) { continue; }

    //
    // Check for underline in setext header
    //
    if (state.sCount[nextLine] >= state.blkIndent) {
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];

      if (pos < max) {
        marker = state.src.charCodeAt(pos);

        if (marker === 0x2D/* - */ || marker === 0x3D/* = */) {
          pos = state.skipChars(pos, marker);
          pos = state.skipSpaces(pos);

          if (pos >= max) {
            level = (marker === 0x3D/* = */ ? 1 : 2);
            break;
          }
        }
      }
    }

    // quirk for blockquotes, this line should already be checked by that rule
    if (state.sCount[nextLine] < 0) { continue; }

    // Some tags can terminate paragraph without empty line.
    terminate = false;
    for (i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) { break; }
  }

  if (!level) {
    // Didn't find valid underline
    return false;
  }

  content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();

  state.line = nextLine + 1;

  token          = state.push('heading_open', 'h' + String(level), 1);
  token.markup   = String.fromCharCode(marker);
  token.map      = [ startLine, state.line ];

  token          = state.push('inline', '', 0);
  token.content  = content;
  token.map      = [ startLine, state.line - 1 ];
  token.children = [];

  token          = state.push('heading_close', 'h' + String(level), -1);
  token.markup   = String.fromCharCode(marker);

  state.parentType = oldParentType;

  return true;
};


/***/ }),

/***/ 8532:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Lists



var isSpace = (__webpack_require__(7022).isSpace);


// Search `[-+*][\n ]`, returns next pos after marker on success
// or -1 on fail.
function skipBulletListMarker(state, startLine) {
  var marker, pos, max, ch;

  pos = state.bMarks[startLine] + state.tShift[startLine];
  max = state.eMarks[startLine];

  marker = state.src.charCodeAt(pos++);
  // Check bullet
  if (marker !== 0x2A/* * */ &&
      marker !== 0x2D/* - */ &&
      marker !== 0x2B/* + */) {
    return -1;
  }

  if (pos < max) {
    ch = state.src.charCodeAt(pos);

    if (!isSpace(ch)) {
      // " -test " - is not a list item
      return -1;
    }
  }

  return pos;
}

// Search `\d+[.)][\n ]`, returns next pos after marker on success
// or -1 on fail.
function skipOrderedListMarker(state, startLine) {
  var ch,
      start = state.bMarks[startLine] + state.tShift[startLine],
      pos = start,
      max = state.eMarks[startLine];

  // List marker should have at least 2 chars (digit + dot)
  if (pos + 1 >= max) { return -1; }

  ch = state.src.charCodeAt(pos++);

  if (ch < 0x30/* 0 */ || ch > 0x39/* 9 */) { return -1; }

  for (;;) {
    // EOL -> fail
    if (pos >= max) { return -1; }

    ch = state.src.charCodeAt(pos++);

    if (ch >= 0x30/* 0 */ && ch <= 0x39/* 9 */) {

      // List marker should have no more than 9 digits
      // (prevents integer overflow in browsers)
      if (pos - start >= 10) { return -1; }

      continue;
    }

    // found valid marker
    if (ch === 0x29/* ) */ || ch === 0x2e/* . */) {
      break;
    }

    return -1;
  }


  if (pos < max) {
    ch = state.src.charCodeAt(pos);

    if (!isSpace(ch)) {
      // " 1.test " - is not a list item
      return -1;
    }
  }
  return pos;
}

function markTightParagraphs(state, idx) {
  var i, l,
      level = state.level + 2;

  for (i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
    if (state.tokens[i].level === level && state.tokens[i].type === 'paragraph_open') {
      state.tokens[i + 2].hidden = true;
      state.tokens[i].hidden = true;
      i += 2;
    }
  }
}


module.exports = function list(state, startLine, endLine, silent) {
  var ch,
      contentStart,
      i,
      indent,
      indentAfterMarker,
      initial,
      isOrdered,
      itemLines,
      l,
      listLines,
      listTokIdx,
      markerCharCode,
      markerValue,
      max,
      nextLine,
      offset,
      oldListIndent,
      oldParentType,
      oldSCount,
      oldTShift,
      oldTight,
      pos,
      posAfterMarker,
      prevEmptyEnd,
      start,
      terminate,
      terminatorRules,
      token,
      isTerminatingParagraph = false,
      tight = true;

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

  // Special case:
  //  - item 1
  //   - item 2
  //    - item 3
  //     - item 4
  //      - this one is a paragraph continuation
  if (state.listIndent >= 0 &&
      state.sCount[startLine] - state.listIndent >= 4 &&
      state.sCount[startLine] < state.blkIndent) {
    return false;
  }

  // limit conditions when list can interrupt
  // a paragraph (validation mode only)
  if (silent && state.parentType === 'paragraph') {
    // Next list item should still terminate previous list item;
    //
    // This code can fail if plugins use blkIndent as well as lists,
    // but I hope the spec gets fixed long before that happens.
    //
    if (state.sCount[startLine] >= state.blkIndent) {
      isTerminatingParagraph = true;
    }
  }

  // Detect list type and position after marker
  if ((posAfterMarker = skipOrderedListMarker(state, startLine)) >= 0) {
    isOrdered = true;
    start = state.bMarks[startLine] + state.tShift[startLine];
    markerValue = Number(state.src.slice(start, posAfterMarker - 1));

    // If we're starting a new ordered list right after
    // a paragraph, it should start with 1.
    if (isTerminatingParagraph && markerValue !== 1) return false;

  } else if ((posAfterMarker = skipBulletListMarker(state, startLine)) >= 0) {
    isOrdered = false;

  } else {
    return false;
  }

  // If we're starting a new unordered list right after
  // a paragraph, first line should not be empty.
  if (isTerminatingParagraph) {
    if (state.skipSpaces(posAfterMarker) >= state.eMarks[startLine]) return false;
  }

  // We should terminate list on style change. Remember first one to compare.
  markerCharCode = state.src.charCodeAt(posAfterMarker - 1);

  // For validation mode we can terminate immediately
  if (silent) { return true; }

  // Start list
  listTokIdx = state.tokens.length;

  if (isOrdered) {
    token       = state.push('ordered_list_open', 'ol', 1);
    if (markerValue !== 1) {
      token.attrs = [ [ 'start', markerValue ] ];
    }

  } else {
    token       = state.push('bullet_list_open', 'ul', 1);
  }

  token.map    = listLines = [ startLine, 0 ];
  token.markup = String.fromCharCode(markerCharCode);

  //
  // Iterate list items
  //

  nextLine = startLine;
  prevEmptyEnd = false;
  terminatorRules = state.md.block.ruler.getRules('list');

  oldParentType = state.parentType;
  state.parentType = 'list';

  while (nextLine < endLine) {
    pos = posAfterMarker;
    max = state.eMarks[nextLine];

    initial = offset = state.sCount[nextLine] + posAfterMarker - (state.bMarks[startLine] + state.tShift[startLine]);

    while (pos < max) {
      ch = state.src.charCodeAt(pos);

      if (ch === 0x09) {
        offset += 4 - (offset + state.bsCount[nextLine]) % 4;
      } else if (ch === 0x20) {
        offset++;
      } else {
        break;
      }

      pos++;
    }

    contentStart = pos;

    if (contentStart >= max) {
      // trimming space in "-    \n  3" case, indent is 1 here
      indentAfterMarker = 1;
    } else {
      indentAfterMarker = offset - initial;
    }

    // If we have more than 4 spaces, the indent is 1
    // (the rest is just indented code block)
    if (indentAfterMarker > 4) { indentAfterMarker = 1; }

    // "  -  test"
    //  ^^^^^ - calculating total length of this thing
    indent = initial + indentAfterMarker;

    // Run subparser & write tokens
    token        = state.push('list_item_open', 'li', 1);
    token.markup = String.fromCharCode(markerCharCode);
    token.map    = itemLines = [ startLine, 0 ];
    if (isOrdered) {
      token.info = state.src.slice(start, posAfterMarker - 1);
    }

    // change current state, then restore it after parser subcall
    oldTight = state.tight;
    oldTShift = state.tShift[startLine];
    oldSCount = state.sCount[startLine];

    //  - example list
    // ^ listIndent position will be here
    //   ^ blkIndent position will be here
    //
    oldListIndent = state.listIndent;
    state.listIndent = state.blkIndent;
    state.blkIndent = indent;

    state.tight = true;
    state.tShift[startLine] = contentStart - state.bMarks[startLine];
    state.sCount[startLine] = offset;

    if (contentStart >= max && state.isEmpty(startLine + 1)) {
      // workaround for this case
      // (list item is empty, list terminates before "foo"):
      // ~~~~~~~~
      //   -
      //
      //     foo
      // ~~~~~~~~
      state.line = Math.min(state.line + 2, endLine);
    } else {
      state.md.block.tokenize(state, startLine, endLine, true);
    }

    // If any of list item is tight, mark list as tight
    if (!state.tight || prevEmptyEnd) {
      tight = false;
    }
    // Item become loose if finish with empty line,
    // but we should filter last element, because it means list finish
    prevEmptyEnd = (state.line - startLine) > 1 && state.isEmpty(state.line - 1);

    state.blkIndent = state.listIndent;
    state.listIndent = oldListIndent;
    state.tShift[startLine] = oldTShift;
    state.sCount[startLine] = oldSCount;
    state.tight = oldTight;

    token        = state.push('list_item_close', 'li', -1);
    token.markup = String.fromCharCode(markerCharCode);

    nextLine = startLine = state.line;
    itemLines[1] = nextLine;
    contentStart = state.bMarks[startLine];

    if (nextLine >= endLine) { break; }

    //
    // Try to check if list is terminated or continued.
    //
    if (state.sCount[nextLine] < state.blkIndent) { break; }

    // if it's indented more than 3 spaces, it should be a code block
    if (state.sCount[startLine] - state.blkIndent >= 4) { break; }

    // fail if terminating block found
    terminate = false;
    for (i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) { break; }

    // fail if list has another type
    if (isOrdered) {
      posAfterMarker = skipOrderedListMarker(state, nextLine);
      if (posAfterMarker < 0) { break; }
      start = state.bMarks[nextLine] + state.tShift[nextLine];
    } else {
      posAfterMarker = skipBulletListMarker(state, nextLine);
      if (posAfterMarker < 0) { break; }
    }

    if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) { break; }
  }

  // Finalize list
  if (isOrdered) {
    token = state.push('ordered_list_close', 'ol', -1);
  } else {
    token = state.push('bullet_list_close', 'ul', -1);
  }
  token.markup = String.fromCharCode(markerCharCode);

  listLines[1] = nextLine;
  state.line = nextLine;

  state.parentType = oldParentType;

  // mark paragraphs tight if needed
  if (tight) {
    markTightParagraphs(state, listTokIdx);
  }

  return true;
};


/***/ }),

/***/ 6864:
/***/ ((module) => {

"use strict";
// Paragraph




module.exports = function paragraph(state, startLine/*, endLine*/) {
  var content, terminate, i, l, token, oldParentType,
      nextLine = startLine + 1,
      terminatorRules = state.md.block.ruler.getRules('paragraph'),
      endLine = state.lineMax;

  oldParentType = state.parentType;
  state.parentType = 'paragraph';

  // jump line-by-line until empty one or EOF
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    // this would be a code block normally, but after paragraph
    // it's considered a lazy continuation regardless of what's there
    if (state.sCount[nextLine] - state.blkIndent > 3) { continue; }

    // quirk for blockquotes, this line should already be checked by that rule
    if (state.sCount[nextLine] < 0) { continue; }

    // Some tags can terminate paragraph without empty line.
    terminate = false;
    for (i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) { break; }
  }

  content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();

  state.line = nextLine;

  token          = state.push('paragraph_open', 'p', 1);
  token.map      = [ startLine, state.line ];

  token          = state.push('inline', '', 0);
  token.content  = content;
  token.map      = [ startLine, state.line ];
  token.children = [];

  token          = state.push('paragraph_close', 'p', -1);

  state.parentType = oldParentType;

  return true;
};


/***/ }),

/***/ 3804:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";



var normalizeReference   = (__webpack_require__(7022).normalizeReference);
var isSpace              = (__webpack_require__(7022).isSpace);


module.exports = function reference(state, startLine, _endLine, silent) {
  var ch,
      destEndPos,
      destEndLineNo,
      endLine,
      href,
      i,
      l,
      label,
      labelEnd,
      oldParentType,
      res,
      start,
      str,
      terminate,
      terminatorRules,
      title,
      lines = 0,
      pos = state.bMarks[startLine] + state.tShift[startLine],
      max = state.eMarks[startLine],
      nextLine = startLine + 1;

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

  if (state.src.charCodeAt(pos) !== 0x5B/* [ */) { return false; }

  // Simple check to quickly interrupt scan on [link](url) at the start of line.
  // Can be useful on practice: https://github.com/markdown-it/markdown-it/issues/54
  while (++pos < max) {
    if (state.src.charCodeAt(pos) === 0x5D /* ] */ &&
        state.src.charCodeAt(pos - 1) !== 0x5C/* \ */) {
      if (pos + 1 === max) { return false; }
      if (state.src.charCodeAt(pos + 1) !== 0x3A/* : */) { return false; }
      break;
    }
  }

  endLine = state.lineMax;

  // jump line-by-line until empty one or EOF
  terminatorRules = state.md.block.ruler.getRules('reference');

  oldParentType = state.parentType;
  state.parentType = 'reference';

  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    // this would be a code block normally, but after paragraph
    // it's considered a lazy continuation regardless of what's there
    if (state.sCount[nextLine] - state.blkIndent > 3) { continue; }

    // quirk for blockquotes, this line should already be checked by that rule
    if (state.sCount[nextLine] < 0) { continue; }

    // Some tags can terminate paragraph without empty line.
    terminate = false;
    for (i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) { break; }
  }

  str = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
  max = str.length;

  for (pos = 1; pos < max; pos++) {
    ch = str.charCodeAt(pos);
    if (ch === 0x5B /* [ */) {
      return false;
    } else if (ch === 0x5D /* ] */) {
      labelEnd = pos;
      break;
    } else if (ch === 0x0A /* \n */) {
      lines++;
    } else if (ch === 0x5C /* \ */) {
      pos++;
      if (pos < max && str.charCodeAt(pos) === 0x0A) {
        lines++;
      }
    }
  }

  if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 0x3A/* : */) { return false; }

  // [label]:   destination   'title'
  //         ^^^ skip optional whitespace here
  for (pos = labelEnd + 2; pos < max; pos++) {
    ch = str.charCodeAt(pos);
    if (ch === 0x0A) {
      lines++;
    } else if (isSpace(ch)) {
      /*eslint no-empty:0*/
    } else {
      break;
    }
  }

  // [label]:   destination   'title'
  //            ^^^^^^^^^^^ parse this
  res = state.md.helpers.parseLinkDestination(str, pos, max);
  if (!res.ok) { return false; }

  href = state.md.normalizeLink(res.str);
  if (!state.md.validateLink(href)) { return false; }

  pos = res.pos;
  lines += res.lines;

  // save cursor state, we could require to rollback later
  destEndPos = pos;
  destEndLineNo = lines;

  // [label]:   destination   'title'
  //                       ^^^ skipping those spaces
  start = pos;
  for (; pos < max; pos++) {
    ch = str.charCodeAt(pos);
    if (ch === 0x0A) {
      lines++;
    } else if (isSpace(ch)) {
      /*eslint no-empty:0*/
    } else {
      break;
    }
  }

  // [label]:   destination   'title'
  //                          ^^^^^^^ parse this
  res = state.md.helpers.parseLinkTitle(str, pos, max);
  if (pos < max && start !== pos && res.ok) {
    title = res.str;
    pos = res.pos;
    lines += res.lines;
  } else {
    title = '';
    pos = destEndPos;
    lines = destEndLineNo;
  }

  // skip trailing spaces until the rest of the line
  while (pos < max) {
    ch = str.charCodeAt(pos);
    if (!isSpace(ch)) { break; }
    pos++;
  }

  if (pos < max && str.charCodeAt(pos) !== 0x0A) {
    if (title) {
      // garbage at the end of the line after title,
      // but it could still be a valid reference if we roll back
      title = '';
      pos = destEndPos;
      lines = destEndLineNo;
      while (pos < max) {
        ch = str.charCodeAt(pos);
        if (!isSpace(ch)) { break; }
        pos++;
      }
    }
  }

  if (pos < max && str.charCodeAt(pos) !== 0x0A) {
    // garbage at the end of the line
    return false;
  }

  label = normalizeReference(str.slice(1, labelEnd));
  if (!label) {
    // CommonMark 0.20 disallows empty labels
    return false;
  }

  // Reference can not terminate anything. This check is for safety only.
  /*istanbul ignore if*/
  if (silent) { return true; }

  if (typeof state.env.references === 'undefined') {
    state.env.references = {};
  }
  if (typeof state.env.references[label] === 'undefined') {
    state.env.references[label] = { title: title, href: href };
  }

  state.parentType = oldParentType;

  state.line = startLine + lines + 1;
  return true;
};


/***/ }),

/***/ 2948:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Parser state class



var Token = __webpack_require__(5872);
var isSpace = (__webpack_require__(7022).isSpace);


function StateBlock(src, md, env, tokens) {
  var ch, s, start, pos, len, indent, offset, indent_found;

  this.src = src;

  // link to parser instance
  this.md     = md;

  this.env = env;

  //
  // Internal state vartiables
  //

  this.tokens = tokens;

  this.bMarks = [];  // line begin offsets for fast jumps
  this.eMarks = [];  // line end offsets for fast jumps
  this.tShift = [];  // offsets of the first non-space characters (tabs not expanded)
  this.sCount = [];  // indents for each line (tabs expanded)

  // An amount of virtual spaces (tabs expanded) between beginning
  // of each line (bMarks) and real beginning of that line.
  //
  // It exists only as a hack because blockquotes override bMarks
  // losing information in the process.
  //
  // It's used only when expanding tabs, you can think about it as
  // an initial tab length, e.g. bsCount=21 applied to string `\t123`
  // means first tab should be expanded to 4-21%4 === 3 spaces.
  //
  this.bsCount = [];

  // block parser variables
  this.blkIndent  = 0; // required block content indent (for example, if we are
                       // inside a list, it would be positioned after list marker)
  this.line       = 0; // line index in src
  this.lineMax    = 0; // lines count
  this.tight      = false;  // loose/tight mode for lists
  this.ddIndent   = -1; // indent of the current dd block (-1 if there isn't any)
  this.listIndent = -1; // indent of the current list block (-1 if there isn't any)

  // can be 'blockquote', 'list', 'root', 'paragraph' or 'reference'
  // used in lists to determine if they interrupt a paragraph
  this.parentType = 'root';

  this.level = 0;

  // renderer
  this.result = '';

  // Create caches
  // Generate markers.
  s = this.src;
  indent_found = false;

  for (start = pos = indent = offset = 0, len = s.length; pos < len; pos++) {
    ch = s.charCodeAt(pos);

    if (!indent_found) {
      if (isSpace(ch)) {
        indent++;

        if (ch === 0x09) {
          offset += 4 - offset % 4;
        } else {
          offset++;
        }
        continue;
      } else {
        indent_found = true;
      }
    }

    if (ch === 0x0A || pos === len - 1) {
      if (ch !== 0x0A) { pos++; }
      this.bMarks.push(start);
      this.eMarks.push(pos);
      this.tShift.push(indent);
      this.sCount.push(offset);
      this.bsCount.push(0);

      indent_found = false;
      indent = 0;
      offset = 0;
      start = pos + 1;
    }
  }

  // Push fake entry to simplify cache bounds checks
  this.bMarks.push(s.length);
  this.eMarks.push(s.length);
  this.tShift.push(0);
  this.sCount.push(0);
  this.bsCount.push(0);

  this.lineMax = this.bMarks.length - 1; // don't count last fake line
}

// Push new token to "stream".
//
StateBlock.prototype.push = function (type, tag, nesting) {
  var token = new Token(type, tag, nesting);
  token.block = true;

  if (nesting < 0) this.level--; // closing tag
  token.level = this.level;
  if (nesting > 0) this.level++; // opening tag

  this.tokens.push(token);
  return token;
};

StateBlock.prototype.isEmpty = function isEmpty(line) {
  return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
};

StateBlock.prototype.skipEmptyLines = function skipEmptyLines(from) {
  for (var max = this.lineMax; from < max; from++) {
    if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
      break;
    }
  }
  return from;
};

// Skip spaces from given position.
StateBlock.prototype.skipSpaces = function skipSpaces(pos) {
  var ch;

  for (var max = this.src.length; pos < max; pos++) {
    ch = this.src.charCodeAt(pos);
    if (!isSpace(ch)) { break; }
  }
  return pos;
};

// Skip spaces from given position in reverse.
StateBlock.prototype.skipSpacesBack = function skipSpacesBack(pos, min) {
  if (pos <= min) { return pos; }

  while (pos > min) {
    if (!isSpace(this.src.charCodeAt(--pos))) { return pos + 1; }
  }
  return pos;
};

// Skip char codes from given position
StateBlock.prototype.skipChars = function skipChars(pos, code) {
  for (var max = this.src.length; pos < max; pos++) {
    if (this.src.charCodeAt(pos) !== code) { break; }
  }
  return pos;
};

// Skip char codes reverse from given position - 1
StateBlock.prototype.skipCharsBack = function skipCharsBack(pos, code, min) {
  if (pos <= min) { return pos; }

  while (pos > min) {
    if (code !== this.src.charCodeAt(--pos)) { return pos + 1; }
  }
  return pos;
};

// cut lines range from source.
StateBlock.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
  var i, lineIndent, ch, first, last, queue, lineStart,
      line = begin;

  if (begin >= end) {
    return '';
  }

  queue = new Array(end - begin);

  for (i = 0; line < end; line++, i++) {
    lineIndent = 0;
    lineStart = first = this.bMarks[line];

    if (line + 1 < end || keepLastLF) {
      // No need for bounds check because we have fake entry on tail.
      last = this.eMarks[line] + 1;
    } else {
      last = this.eMarks[line];
    }

    while (first < last && lineIndent < indent) {
      ch = this.src.charCodeAt(first);

      if (isSpace(ch)) {
        if (ch === 0x09) {
          lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
        } else {
          lineIndent++;
        }
      } else if (first - lineStart < this.tShift[line]) {
        // patched tShift masked characters to look like spaces (blockquotes, list markers)
        lineIndent++;
      } else {
        break;
      }

      first++;
    }

    if (lineIndent > indent) {
      // partially expanding tabs in code blocks, e.g '\t\tfoobar'
      // with indent=2 becomes '  \tfoobar'
      queue[i] = new Array(lineIndent - indent + 1).join(' ') + this.src.slice(first, last);
    } else {
      queue[i] = this.src.slice(first, last);
    }
  }

  return queue.join('');
};

// re-export Token class to use in block rules
StateBlock.prototype.Token = Token;


module.exports = StateBlock;


/***/ }),

/***/ 1785:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// GFM table, https://github.github.com/gfm/#tables-extension-



var isSpace = (__webpack_require__(7022).isSpace);


function getLine(state, line) {
  var pos = state.bMarks[line] + state.tShift[line],
      max = state.eMarks[line];

  return state.src.slice(pos, max);
}

function escapedSplit(str) {
  var result = [],
      pos = 0,
      max = str.length,
      ch,
      isEscaped = false,
      lastPos = 0,
      current = '';

  ch  = str.charCodeAt(pos);

  while (pos < max) {
    if (ch === 0x7c/* | */) {
      if (!isEscaped) {
        // pipe separating cells, '|'
        result.push(current + str.substring(lastPos, pos));
        current = '';
        lastPos = pos + 1;
      } else {
        // escaped pipe, '\|'
        current += str.substring(lastPos, pos - 1);
        lastPos = pos;
      }
    }

    isEscaped = (ch === 0x5c/* \ */);
    pos++;

    ch = str.charCodeAt(pos);
  }

  result.push(current + str.substring(lastPos));

  return result;
}


module.exports = function table(state, startLine, endLine, silent) {
  var ch, lineText, pos, i, l, nextLine, columns, columnCount, token,
      aligns, t, tableLines, tbodyLines, oldParentType, terminate,
      terminatorRules, firstCh, secondCh;

  // should have at least two lines
  if (startLine + 2 > endLine) { return false; }

  nextLine = startLine + 1;

  if (state.sCount[nextLine] < state.blkIndent) { return false; }

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[nextLine] - state.blkIndent >= 4) { return false; }

  // first character of the second line should be '|', '-', ':',
  // and no other characters are allowed but spaces;
  // basically, this is the equivalent of /^[-:|][-:|\s]*$/ regexp

  pos = state.bMarks[nextLine] + state.tShift[nextLine];
  if (pos >= state.eMarks[nextLine]) { return false; }

  firstCh = state.src.charCodeAt(pos++);
  if (firstCh !== 0x7C/* | */ && firstCh !== 0x2D/* - */ && firstCh !== 0x3A/* : */) { return false; }

  if (pos >= state.eMarks[nextLine]) { return false; }

  secondCh = state.src.charCodeAt(pos++);
  if (secondCh !== 0x7C/* | */ && secondCh !== 0x2D/* - */ && secondCh !== 0x3A/* : */ && !isSpace(secondCh)) {
    return false;
  }

  // if first character is '-', then second character must not be a space
  // (due to parsing ambiguity with list)
  if (firstCh === 0x2D/* - */ && isSpace(secondCh)) { return false; }

  while (pos < state.eMarks[nextLine]) {
    ch = state.src.charCodeAt(pos);

    if (ch !== 0x7C/* | */ && ch !== 0x2D/* - */ && ch !== 0x3A/* : */ && !isSpace(ch)) { return false; }

    pos++;
  }

  lineText = getLine(state, startLine + 1);

  columns = lineText.split('|');
  aligns = [];
  for (i = 0; i < columns.length; i++) {
    t = columns[i].trim();
    if (!t) {
      // allow empty columns before and after table, but not in between columns;
      // e.g. allow ` |---| `, disallow ` ---||--- `
      if (i === 0 || i === columns.length - 1) {
        continue;
      } else {
        return false;
      }
    }

    if (!/^:?-+:?$/.test(t)) { return false; }
    if (t.charCodeAt(t.length - 1) === 0x3A/* : */) {
      aligns.push(t.charCodeAt(0) === 0x3A/* : */ ? 'center' : 'right');
    } else if (t.charCodeAt(0) === 0x3A/* : */) {
      aligns.push('left');
    } else {
      aligns.push('');
    }
  }

  lineText = getLine(state, startLine).trim();
  if (lineText.indexOf('|') === -1) { return false; }
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
  columns = escapedSplit(lineText);
  if (columns.length && columns[0] === '') columns.shift();
  if (columns.length && columns[columns.length - 1] === '') columns.pop();

  // header row will define an amount of columns in the entire table,
  // and align row should be exactly the same (the rest of the rows can differ)
  columnCount = columns.length;
  if (columnCount === 0 || columnCount !== aligns.length) { return false; }

  if (silent) { return true; }

  oldParentType = state.parentType;
  state.parentType = 'table';

  // use 'blockquote' lists for termination because it's
  // the most similar to tables
  terminatorRules = state.md.block.ruler.getRules('blockquote');

  token     = state.push('table_open', 'table', 1);
  token.map = tableLines = [ startLine, 0 ];

  token     = state.push('thead_open', 'thead', 1);
  token.map = [ startLine, startLine + 1 ];

  token     = state.push('tr_open', 'tr', 1);
  token.map = [ startLine, startLine + 1 ];

  for (i = 0; i < columns.length; i++) {
    token          = state.push('th_open', 'th', 1);
    if (aligns[i]) {
      token.attrs  = [ [ 'style', 'text-align:' + aligns[i] ] ];
    }

    token          = state.push('inline', '', 0);
    token.content  = columns[i].trim();
    token.children = [];

    token          = state.push('th_close', 'th', -1);
  }

  token     = state.push('tr_close', 'tr', -1);
  token     = state.push('thead_close', 'thead', -1);

  for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
    if (state.sCount[nextLine] < state.blkIndent) { break; }

    terminate = false;
    for (i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }

    if (terminate) { break; }
    lineText = getLine(state, nextLine).trim();
    if (!lineText) { break; }
    if (state.sCount[nextLine] - state.blkIndent >= 4) { break; }
    columns = escapedSplit(lineText);
    if (columns.length && columns[0] === '') columns.shift();
    if (columns.length && columns[columns.length - 1] === '') columns.pop();

    if (nextLine === startLine + 2) {
      token     = state.push('tbody_open', 'tbody', 1);
      token.map = tbodyLines = [ startLine + 2, 0 ];
    }

    token     = state.push('tr_open', 'tr', 1);
    token.map = [ nextLine, nextLine + 1 ];

    for (i = 0; i < columnCount; i++) {
      token          = state.push('td_open', 'td', 1);
      if (aligns[i]) {
        token.attrs  = [ [ 'style', 'text-align:' + aligns[i] ] ];
      }

      token          = state.push('inline', '', 0);
      token.content  = columns[i] ? columns[i].trim() : '';
      token.children = [];

      token          = state.push('td_close', 'td', -1);
    }
    token = state.push('tr_close', 'tr', -1);
  }

  if (tbodyLines) {
    token = state.push('tbody_close', 'tbody', -1);
    tbodyLines[1] = nextLine;
  }

  token = state.push('table_close', 'table', -1);
  tableLines[1] = nextLine;

  state.parentType = oldParentType;
  state.line = nextLine;
  return true;
};


/***/ }),

/***/ 898:
/***/ ((module) => {

"use strict";



module.exports = function block(state) {
  var token;

  if (state.inlineMode) {
    token          = new state.Token('inline', '', 0);
    token.content  = state.src;
    token.map      = [ 0, 1 ];
    token.children = [];
    state.tokens.push(token);
  } else {
    state.md.block.parse(state.src, state.md, state.env, state.tokens);
  }
};


/***/ }),

/***/ 9827:
/***/ ((module) => {

"use strict";


module.exports = function inline(state) {
  var tokens = state.tokens, tok, i, l;

  // Parse inlines
  for (i = 0, l = tokens.length; i < l; i++) {
    tok = tokens[i];
    if (tok.type === 'inline') {
      state.md.inline.parse(tok.content, state.md, state.env, tok.children);
    }
  }
};


/***/ }),

/***/ 7830:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Replace link-like texts with link nodes.
//
// Currently restricted by `md.validateLink()` to http/https/ftp
//



var arrayReplaceAt = (__webpack_require__(7022).arrayReplaceAt);


function isLinkOpen(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
  return /^<\/a\s*>/i.test(str);
}


module.exports = function linkify(state) {
  var i, j, l, tokens, token, currentToken, nodes, ln, text, pos, lastPos,
      level, htmlLinkLevel, url, fullUrl, urlText,
      blockTokens = state.tokens,
      links;

  if (!state.md.options.linkify) { return; }

  for (j = 0, l = blockTokens.length; j < l; j++) {
    if (blockTokens[j].type !== 'inline' ||
        !state.md.linkify.pretest(blockTokens[j].content)) {
      continue;
    }

    tokens = blockTokens[j].children;

    htmlLinkLevel = 0;

    // We scan from the end, to keep position when new tags added.
    // Use reversed logic in links start/end match
    for (i = tokens.length - 1; i >= 0; i--) {
      currentToken = tokens[i];

      // Skip content of markdown links
      if (currentToken.type === 'link_close') {
        i--;
        while (tokens[i].level !== currentToken.level && tokens[i].type !== 'link_open') {
          i--;
        }
        continue;
      }

      // Skip content of html tag links
      if (currentToken.type === 'html_inline') {
        if (isLinkOpen(currentToken.content) && htmlLinkLevel > 0) {
          htmlLinkLevel--;
        }
        if (isLinkClose(currentToken.content)) {
          htmlLinkLevel++;
        }
      }
      if (htmlLinkLevel > 0) { continue; }

      if (currentToken.type === 'text' && state.md.linkify.test(currentToken.content)) {

        text = currentToken.content;
        links = state.md.linkify.match(text);

        // Now split string to nodes
        nodes = [];
        level = currentToken.level;
        lastPos = 0;

        // forbid escape sequence at the start of the string,
        // this avoids http\://example.com/ from being linkified as
        // http:<a href="//example.com/">//example.com/</a>
        if (links.length > 0 &&
            links[0].index === 0 &&
            i > 0 &&
            tokens[i - 1].type === 'text_special') {
          links = links.slice(1);
        }

        for (ln = 0; ln < links.length; ln++) {
          url = links[ln].url;
          fullUrl = state.md.normalizeLink(url);
          if (!state.md.validateLink(fullUrl)) { continue; }

          urlText = links[ln].text;

          // Linkifier might send raw hostnames like "example.com", where url
          // starts with domain name. So we prepend http:// in those cases,
          // and remove it afterwards.
          //
          if (!links[ln].schema) {
            urlText = state.md.normalizeLinkText('http://' + urlText).replace(/^http:\/\//, '');
          } else if (links[ln].schema === 'mailto:' && !/^mailto:/i.test(urlText)) {
            urlText = state.md.normalizeLinkText('mailto:' + urlText).replace(/^mailto:/, '');
          } else {
            urlText = state.md.normalizeLinkText(urlText);
          }

          pos = links[ln].index;

          if (pos > lastPos) {
            token         = new state.Token('text', '', 0);
            token.content = text.slice(lastPos, pos);
            token.level   = level;
            nodes.push(token);
          }

          token         = new state.Token('link_open', 'a', 1);
          token.attrs   = [ [ 'href', fullUrl ] ];
          token.level   = level++;
          token.markup  = 'linkify';
          token.info    = 'auto';
          nodes.push(token);

          token         = new state.Token('text', '', 0);
          token.content = urlText;
          token.level   = level;
          nodes.push(token);

          token         = new state.Token('link_close', 'a', -1);
          token.level   = --level;
          token.markup  = 'linkify';
          token.info    = 'auto';
          nodes.push(token);

          lastPos = links[ln].lastIndex;
        }
        if (lastPos < text.length) {
          token         = new state.Token('text', '', 0);
          token.content = text.slice(lastPos);
          token.level   = level;
          nodes.push(token);
        }

        // replace current node
        blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
      }
    }
  }
};


/***/ }),

/***/ 4129:
/***/ ((module) => {

"use strict";
// Normalize input string




// https://spec.commonmark.org/0.29/#line-ending
var NEWLINES_RE  = /\r\n?|\n/g;
var NULL_RE      = /\0/g;


module.exports = function normalize(state) {
  var str;

  // Normalize newlines
  str = state.src.replace(NEWLINES_RE, '\n');

  // Replace NULL characters
  str = str.replace(NULL_RE, '\uFFFD');

  state.src = str;
};


/***/ }),

/***/ 2834:
/***/ ((module) => {

"use strict";
// Simple typographic replacements
//
// (c) (C) → ©
// (tm) (TM) → ™
// (r) (R) → ®
// +- → ±
// (p) (P) -> §
// ... → … (also ?.... → ?.., !.... → !..)
// ???????? → ???, !!!!! → !!!, `,,` → `,`
// -- → &ndash;, --- → &mdash;
//


// TODO:
// - fractionals 1/2, 1/4, 3/4 -> ½, ¼, ¾
// - multiplications 2 x 4 -> 2 × 4

var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;

// Workaround for phantomjs - need regex without /g flag,
// or root check will fail every second time
var SCOPED_ABBR_TEST_RE = /\((c|tm|r)\)/i;

var SCOPED_ABBR_RE = /\((c|tm|r)\)/ig;
var SCOPED_ABBR = {
  c: '©',
  r: '®',
  tm: '™'
};

function replaceFn(match, name) {
  return SCOPED_ABBR[name.toLowerCase()];
}

function replace_scoped(inlineTokens) {
  var i, token, inside_autolink = 0;

  for (i = inlineTokens.length - 1; i >= 0; i--) {
    token = inlineTokens[i];

    if (token.type === 'text' && !inside_autolink) {
      token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
    }

    if (token.type === 'link_open' && token.info === 'auto') {
      inside_autolink--;
    }

    if (token.type === 'link_close' && token.info === 'auto') {
      inside_autolink++;
    }
  }
}

function replace_rare(inlineTokens) {
  var i, token, inside_autolink = 0;

  for (i = inlineTokens.length - 1; i >= 0; i--) {
    token = inlineTokens[i];

    if (token.type === 'text' && !inside_autolink) {
      if (RARE_RE.test(token.content)) {
        token.content = token.content
          .replace(/\+-/g, '±')
          // .., ..., ....... -> …
          // but ?..... & !..... -> ?.. & !..
          .replace(/\.{2,}/g, '…').replace(/([?!])…/g, '$1..')
          .replace(/([?!]){4,}/g, '$1$1$1').replace(/,{2,}/g, ',')
          // em-dash
          .replace(/(^|[^-])---(?=[^-]|$)/mg, '$1\u2014')
          // en-dash
          .replace(/(^|\s)--(?=\s|$)/mg, '$1\u2013')
          .replace(/(^|[^-\s])--(?=[^-\s]|$)/mg, '$1\u2013');
      }
    }

    if (token.type === 'link_open' && token.info === 'auto') {
      inside_autolink--;
    }

    if (token.type === 'link_close' && token.info === 'auto') {
      inside_autolink++;
    }
  }
}


module.exports = function replace(state) {
  var blkIdx;

  if (!state.md.options.typographer) { return; }

  for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {

    if (state.tokens[blkIdx].type !== 'inline') { continue; }

    if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) {
      replace_scoped(state.tokens[blkIdx].children);
    }

    if (RARE_RE.test(state.tokens[blkIdx].content)) {
      replace_rare(state.tokens[blkIdx].children);
    }

  }
};


/***/ }),

/***/ 8450:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Convert straight quotation marks to typographic ones
//



var isWhiteSpace   = (__webpack_require__(7022).isWhiteSpace);
var isPunctChar    = (__webpack_require__(7022).isPunctChar);
var isMdAsciiPunct = (__webpack_require__(7022).isMdAsciiPunct);

var QUOTE_TEST_RE = /['"]/;
var QUOTE_RE = /['"]/g;
var APOSTROPHE = '\u2019'; /* ’ */


function replaceAt(str, index, ch) {
  return str.slice(0, index) + ch + str.slice(index + 1);
}

function process_inlines(tokens, state) {
  var i, token, text, t, pos, max, thisLevel, item, lastChar, nextChar,
      isLastPunctChar, isNextPunctChar, isLastWhiteSpace, isNextWhiteSpace,
      canOpen, canClose, j, isSingle, stack, openQuote, closeQuote;

  stack = [];

  for (i = 0; i < tokens.length; i++) {
    token = tokens[i];

    thisLevel = tokens[i].level;

    for (j = stack.length - 1; j >= 0; j--) {
      if (stack[j].level <= thisLevel) { break; }
    }
    stack.length = j + 1;

    if (token.type !== 'text') { continue; }

    text = token.content;
    pos = 0;
    max = text.length;

    /*eslint no-labels:0,block-scoped-var:0*/
    OUTER:
    while (pos < max) {
      QUOTE_RE.lastIndex = pos;
      t = QUOTE_RE.exec(text);
      if (!t) { break; }

      canOpen = canClose = true;
      pos = t.index + 1;
      isSingle = (t[0] === "'");

      // Find previous character,
      // default to space if it's the beginning of the line
      //
      lastChar = 0x20;

      if (t.index - 1 >= 0) {
        lastChar = text.charCodeAt(t.index - 1);
      } else {
        for (j = i - 1; j >= 0; j--) {
          if (tokens[j].type === 'softbreak' || tokens[j].type === 'hardbreak') break; // lastChar defaults to 0x20
          if (!tokens[j].content) continue; // should skip all tokens except 'text', 'html_inline' or 'code_inline'

          lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
          break;
        }
      }

      // Find next character,
      // default to space if it's the end of the line
      //
      nextChar = 0x20;

      if (pos < max) {
        nextChar = text.charCodeAt(pos);
      } else {
        for (j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === 'softbreak' || tokens[j].type === 'hardbreak') break; // nextChar defaults to 0x20
          if (!tokens[j].content) continue; // should skip all tokens except 'text', 'html_inline' or 'code_inline'

          nextChar = tokens[j].content.charCodeAt(0);
          break;
        }
      }

      isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
      isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));

      isLastWhiteSpace = isWhiteSpace(lastChar);
      isNextWhiteSpace = isWhiteSpace(nextChar);

      if (isNextWhiteSpace) {
        canOpen = false;
      } else if (isNextPunctChar) {
        if (!(isLastWhiteSpace || isLastPunctChar)) {
          canOpen = false;
        }
      }

      if (isLastWhiteSpace) {
        canClose = false;
      } else if (isLastPunctChar) {
        if (!(isNextWhiteSpace || isNextPunctChar)) {
          canClose = false;
        }
      }

      if (nextChar === 0x22 /* " */ && t[0] === '"') {
        if (lastChar >= 0x30 /* 0 */ && lastChar <= 0x39 /* 9 */) {
          // special case: 1"" - count first quote as an inch
          canClose = canOpen = false;
        }
      }

      if (canOpen && canClose) {
        // Replace quotes in the middle of punctuation sequence, but not
        // in the middle of the words, i.e.:
        //
        // 1. foo " bar " baz - not replaced
        // 2. foo-"-bar-"-baz - replaced
        // 3. foo"bar"baz     - not replaced
        //
        canOpen = isLastPunctChar;
        canClose = isNextPunctChar;
      }

      if (!canOpen && !canClose) {
        // middle of word
        if (isSingle) {
          token.content = replaceAt(token.content, t.index, APOSTROPHE);
        }
        continue;
      }

      if (canClose) {
        // this could be a closing quote, rewind the stack to get a match
        for (j = stack.length - 1; j >= 0; j--) {
          item = stack[j];
          if (stack[j].level < thisLevel) { break; }
          if (item.single === isSingle && stack[j].level === thisLevel) {
            item = stack[j];

            if (isSingle) {
              openQuote = state.md.options.quotes[2];
              closeQuote = state.md.options.quotes[3];
            } else {
              openQuote = state.md.options.quotes[0];
              closeQuote = state.md.options.quotes[1];
            }

            // replace token.content *before* tokens[item.token].content,
            // because, if they are pointing at the same token, replaceAt
            // could mess up indices when quote length != 1
            token.content = replaceAt(token.content, t.index, closeQuote);
            tokens[item.token].content = replaceAt(
              tokens[item.token].content, item.pos, openQuote);

            pos += closeQuote.length - 1;
            if (item.token === i) { pos += openQuote.length - 1; }

            text = token.content;
            max = text.length;

            stack.length = j;
            continue OUTER;
          }
        }
      }

      if (canOpen) {
        stack.push({
          token: i,
          pos: t.index,
          single: isSingle,
          level: thisLevel
        });
      } else if (canClose && isSingle) {
        token.content = replaceAt(token.content, t.index, APOSTROPHE);
      }
    }
  }
}


module.exports = function smartquotes(state) {
  /*eslint max-depth:0*/
  var blkIdx;

  if (!state.md.options.typographer) { return; }

  for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {

    if (state.tokens[blkIdx].type !== 'inline' ||
        !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) {
      continue;
    }

    process_inlines(state.tokens[blkIdx].children, state);
  }
};


/***/ }),

/***/ 6480:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Core state object
//


var Token = __webpack_require__(5872);


function StateCore(src, md, env) {
  this.src = src;
  this.env = env;
  this.tokens = [];
  this.inlineMode = false;
  this.md = md; // link to parser instance
}

// re-export Token class to use in core rules
StateCore.prototype.Token = Token;


module.exports = StateCore;


/***/ }),

/***/ 6633:
/***/ ((module) => {

"use strict";
// Join raw text tokens with the rest of the text
//
// This is set as a separate rule to provide an opportunity for plugins
// to run text replacements after text join, but before escape join.
//
// For example, `\:)` shouldn't be replaced with an emoji.
//



module.exports = function text_join(state) {
  var j, l, tokens, curr, max, last,
      blockTokens = state.tokens;

  for (j = 0, l = blockTokens.length; j < l; j++) {
    if (blockTokens[j].type !== 'inline') continue;

    tokens = blockTokens[j].children;
    max = tokens.length;

    for (curr = 0; curr < max; curr++) {
      if (tokens[curr].type === 'text_special') {
        tokens[curr].type = 'text';
      }
    }

    for (curr = last = 0; curr < max; curr++) {
      if (tokens[curr].type === 'text' &&
          curr + 1 < max &&
          tokens[curr + 1].type === 'text') {

        // collapse two adjacent text nodes
        tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
      } else {
        if (curr !== last) { tokens[last] = tokens[curr]; }

        last++;
      }
    }

    if (curr !== last) {
      tokens.length = last;
    }
  }
};


/***/ }),

/***/ 3420:
/***/ ((module) => {

"use strict";
// Process autolinks '<protocol:...>'




/*eslint max-len:0*/
var EMAIL_RE    = /^([a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
var AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.\-]{1,31}):([^<>\x00-\x20]*)$/;


module.exports = function autolink(state, silent) {
  var url, fullUrl, token, ch, start, max,
      pos = state.pos;

  if (state.src.charCodeAt(pos) !== 0x3C/* < */) { return false; }

  start = state.pos;
  max = state.posMax;

  for (;;) {
    if (++pos >= max) return false;

    ch = state.src.charCodeAt(pos);

    if (ch === 0x3C /* < */) return false;
    if (ch === 0x3E /* > */) break;
  }

  url = state.src.slice(start + 1, pos);

  if (AUTOLINK_RE.test(url)) {
    fullUrl = state.md.normalizeLink(url);
    if (!state.md.validateLink(fullUrl)) { return false; }

    if (!silent) {
      token         = state.push('link_open', 'a', 1);
      token.attrs   = [ [ 'href', fullUrl ] ];
      token.markup  = 'autolink';
      token.info    = 'auto';

      token         = state.push('text', '', 0);
      token.content = state.md.normalizeLinkText(url);

      token         = state.push('link_close', 'a', -1);
      token.markup  = 'autolink';
      token.info    = 'auto';
    }

    state.pos += url.length + 2;
    return true;
  }

  if (EMAIL_RE.test(url)) {
    fullUrl = state.md.normalizeLink('mailto:' + url);
    if (!state.md.validateLink(fullUrl)) { return false; }

    if (!silent) {
      token         = state.push('link_open', 'a', 1);
      token.attrs   = [ [ 'href', fullUrl ] ];
      token.markup  = 'autolink';
      token.info    = 'auto';

      token         = state.push('text', '', 0);
      token.content = state.md.normalizeLinkText(url);

      token         = state.push('link_close', 'a', -1);
      token.markup  = 'autolink';
      token.info    = 'auto';
    }

    state.pos += url.length + 2;
    return true;
  }

  return false;
};


/***/ }),

/***/ 40:
/***/ ((module) => {

"use strict";
// Parse backticks




module.exports = function backtick(state, silent) {
  var start, max, marker, token, matchStart, matchEnd, openerLength, closerLength,
      pos = state.pos,
      ch = state.src.charCodeAt(pos);

  if (ch !== 0x60/* ` */) { return false; }

  start = pos;
  pos++;
  max = state.posMax;

  // scan marker length
  while (pos < max && state.src.charCodeAt(pos) === 0x60/* ` */) { pos++; }

  marker = state.src.slice(start, pos);
  openerLength = marker.length;

  if (state.backticksScanned && (state.backticks[openerLength] || 0) <= start) {
    if (!silent) state.pending += marker;
    state.pos += openerLength;
    return true;
  }

  matchStart = matchEnd = pos;

  // Nothing found in the cache, scan until the end of the line (or until marker is found)
  while ((matchStart = state.src.indexOf('`', matchEnd)) !== -1) {
    matchEnd = matchStart + 1;

    // scan marker length
    while (matchEnd < max && state.src.charCodeAt(matchEnd) === 0x60/* ` */) { matchEnd++; }

    closerLength = matchEnd - matchStart;

    if (closerLength === openerLength) {
      // Found matching closer length.
      if (!silent) {
        token     = state.push('code_inline', 'code', 0);
        token.markup  = marker;
        token.content = state.src.slice(pos, matchStart)
          .replace(/\n/g, ' ')
          .replace(/^ (.+) $/, '$1');
      }
      state.pos = matchEnd;
      return true;
    }

    // Some different length found, put it in cache as upper limit of where closer can be found
    state.backticks[closerLength] = matchStart;
  }

  // Scanned through the end, didn't find anything
  state.backticksScanned = true;

  if (!silent) state.pending += marker;
  state.pos += openerLength;
  return true;
};


/***/ }),

/***/ 9354:
/***/ ((module) => {

"use strict";
// For each opening emphasis-like marker find a matching closing one
//



function processDelimiters(state, delimiters) {
  var closerIdx, openerIdx, closer, opener, minOpenerIdx, newMinOpenerIdx,
      isOddMatch, lastJump,
      openersBottom = {},
      max = delimiters.length;

  if (!max) return;

  // headerIdx is the first delimiter of the current (where closer is) delimiter run
  var headerIdx = 0;
  var lastTokenIdx = -2; // needs any value lower than -1
  var jumps = [];

  for (closerIdx = 0; closerIdx < max; closerIdx++) {
    closer = delimiters[closerIdx];

    jumps.push(0);

    // markers belong to same delimiter run if:
    //  - they have adjacent tokens
    //  - AND markers are the same
    //
    if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) {
      headerIdx = closerIdx;
    }

    lastTokenIdx = closer.token;

    // Length is only used for emphasis-specific "rule of 3",
    // if it's not defined (in strikethrough or 3rd party plugins),
    // we can default it to 0 to disable those checks.
    //
    closer.length = closer.length || 0;

    if (!closer.close) continue;

    // Previously calculated lower bounds (previous fails)
    // for each marker, each delimiter length modulo 3,
    // and for whether this closer can be an opener;
    // https://github.com/commonmark/cmark/commit/34250e12ccebdc6372b8b49c44fab57c72443460
    if (!openersBottom.hasOwnProperty(closer.marker)) {
      openersBottom[closer.marker] = [ -1, -1, -1, -1, -1, -1 ];
    }

    minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length % 3)];

    openerIdx = headerIdx - jumps[headerIdx] - 1;

    newMinOpenerIdx = openerIdx;

    for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
      opener = delimiters[openerIdx];

      if (opener.marker !== closer.marker) continue;

      if (opener.open && opener.end < 0) {

        isOddMatch = false;

        // from spec:
        //
        // If one of the delimiters can both open and close emphasis, then the
        // sum of the lengths of the delimiter runs containing the opening and
        // closing delimiters must not be a multiple of 3 unless both lengths
        // are multiples of 3.
        //
        if (opener.close || closer.open) {
          if ((opener.length + closer.length) % 3 === 0) {
            if (opener.length % 3 !== 0 || closer.length % 3 !== 0) {
              isOddMatch = true;
            }
          }
        }

        if (!isOddMatch) {
          // If previous delimiter cannot be an opener, we can safely skip
          // the entire sequence in future checks. This is required to make
          // sure algorithm has linear complexity (see *_*_*_*_*_... case).
          //
          lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ?
            jumps[openerIdx - 1] + 1 :
            0;

          jumps[closerIdx] = closerIdx - openerIdx + lastJump;
          jumps[openerIdx] = lastJump;

          closer.open  = false;
          opener.end   = closerIdx;
          opener.close = false;
          newMinOpenerIdx = -1;
          // treat next token as start of run,
          // it optimizes skips in **<...>**a**<...>** pathological case
          lastTokenIdx = -2;
          break;
        }
      }
    }

    if (newMinOpenerIdx !== -1) {
      // If match for this delimiter run failed, we want to set lower bound for
      // future lookups. This is required to make sure algorithm has linear
      // complexity.
      //
      // See details here:
      // https://github.com/commonmark/cmark/issues/178#issuecomment-270417442
      //
      openersBottom[closer.marker][(closer.open ? 3 : 0) + ((closer.length || 0) % 3)] = newMinOpenerIdx;
    }
  }
}


module.exports = function link_pairs(state) {
  var curr,
      tokens_meta = state.tokens_meta,
      max = state.tokens_meta.length;

  processDelimiters(state, state.delimiters);

  for (curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      processDelimiters(state, tokens_meta[curr].delimiters);
    }
  }
};


/***/ }),

/***/ 7894:
/***/ ((module) => {

"use strict";
// Process *this* and _that_
//



// Insert each marker as a separate text token, and add it to delimiter list
//
module.exports.w = function emphasis(state, silent) {
  var i, scanned, token,
      start = state.pos,
      marker = state.src.charCodeAt(start);

  if (silent) { return false; }

  if (marker !== 0x5F /* _ */ && marker !== 0x2A /* * */) { return false; }

  scanned = state.scanDelims(state.pos, marker === 0x2A);

  for (i = 0; i < scanned.length; i++) {
    token         = state.push('text', '', 0);
    token.content = String.fromCharCode(marker);

    state.delimiters.push({
      // Char code of the starting marker (number).
      //
      marker: marker,

      // Total length of these series of delimiters.
      //
      length: scanned.length,

      // A position of the token this delimiter corresponds to.
      //
      token:  state.tokens.length - 1,

      // If this delimiter is matched as a valid opener, `end` will be
      // equal to its position, otherwise it's `-1`.
      //
      end:    -1,

      // Boolean flags that determine if this delimiter could open or close
      // an emphasis.
      //
      open:   scanned.can_open,
      close:  scanned.can_close
    });
  }

  state.pos += scanned.length;

  return true;
};


function postProcess(state, delimiters) {
  var i,
      startDelim,
      endDelim,
      token,
      ch,
      isStrong,
      max = delimiters.length;

  for (i = max - 1; i >= 0; i--) {
    startDelim = delimiters[i];

    if (startDelim.marker !== 0x5F/* _ */ && startDelim.marker !== 0x2A/* * */) {
      continue;
    }

    // Process only opening markers
    if (startDelim.end === -1) {
      continue;
    }

    endDelim = delimiters[startDelim.end];

    // If the previous delimiter has the same marker and is adjacent to this one,
    // merge those into one strong delimiter.
    //
    // `<em><em>whatever</em></em>` -> `<strong>whatever</strong>`
    //
    isStrong = i > 0 &&
               delimiters[i - 1].end === startDelim.end + 1 &&
               // check that first two markers match and adjacent
               delimiters[i - 1].marker === startDelim.marker &&
               delimiters[i - 1].token === startDelim.token - 1 &&
               // check that last two markers are adjacent (we can safely assume they match)
               delimiters[startDelim.end + 1].token === endDelim.token + 1;

    ch = String.fromCharCode(startDelim.marker);

    token         = state.tokens[startDelim.token];
    token.type    = isStrong ? 'strong_open' : 'em_open';
    token.tag     = isStrong ? 'strong' : 'em';
    token.nesting = 1;
    token.markup  = isStrong ? ch + ch : ch;
    token.content = '';

    token         = state.tokens[endDelim.token];
    token.type    = isStrong ? 'strong_close' : 'em_close';
    token.tag     = isStrong ? 'strong' : 'em';
    token.nesting = -1;
    token.markup  = isStrong ? ch + ch : ch;
    token.content = '';

    if (isStrong) {
      state.tokens[delimiters[i - 1].token].content = '';
      state.tokens[delimiters[startDelim.end + 1].token].content = '';
      i--;
    }
  }
}


// Walk through delimiter list and replace text tokens with tags
//
module.exports.g = function emphasis(state) {
  var curr,
      tokens_meta = state.tokens_meta,
      max = state.tokens_meta.length;

  postProcess(state, state.delimiters);

  for (curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      postProcess(state, tokens_meta[curr].delimiters);
    }
  }
};


/***/ }),

/***/ 9391:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Process html entity - &#123;, &#xAF;, &quot;, ...



var entities          = __webpack_require__(6233);
var has               = (__webpack_require__(7022).has);
var isValidEntityCode = (__webpack_require__(7022).isValidEntityCode);
var fromCodePoint     = (__webpack_require__(7022).fromCodePoint);


var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
var NAMED_RE   = /^&([a-z][a-z0-9]{1,31});/i;


module.exports = function entity(state, silent) {
  var ch, code, match, token, pos = state.pos, max = state.posMax;

  if (state.src.charCodeAt(pos) !== 0x26/* & */) return false;

  if (pos + 1 >= max) return false;

  ch = state.src.charCodeAt(pos + 1);

  if (ch === 0x23 /* # */) {
    match = state.src.slice(pos).match(DIGITAL_RE);
    if (match) {
      if (!silent) {
        code = match[1][0].toLowerCase() === 'x' ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);

        token         = state.push('text_special', '', 0);
        token.content = isValidEntityCode(code) ? fromCodePoint(code) : fromCodePoint(0xFFFD);
        token.markup  = match[0];
        token.info    = 'entity';
      }
      state.pos += match[0].length;
      return true;
    }
  } else {
    match = state.src.slice(pos).match(NAMED_RE);
    if (match) {
      if (has(entities, match[1])) {
        if (!silent) {
          token         = state.push('text_special', '', 0);
          token.content = entities[match[1]];
          token.markup  = match[0];
          token.info    = 'entity';
        }
        state.pos += match[0].length;
        return true;
      }
    }
  }

  return false;
};


/***/ }),

/***/ 1917:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Process escaped chars and hardbreaks



var isSpace = (__webpack_require__(7022).isSpace);

var ESCAPED = [];

for (var i = 0; i < 256; i++) { ESCAPED.push(0); }

'\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'
  .split('').forEach(function (ch) { ESCAPED[ch.charCodeAt(0)] = 1; });


module.exports = function escape(state, silent) {
  var ch1, ch2, origStr, escapedStr, token, pos = state.pos, max = state.posMax;

  if (state.src.charCodeAt(pos) !== 0x5C/* \ */) return false;
  pos++;

  // '\' at the end of the inline block
  if (pos >= max) return false;

  ch1 = state.src.charCodeAt(pos);

  if (ch1 === 0x0A) {
    if (!silent) {
      state.push('hardbreak', 'br', 0);
    }

    pos++;
    // skip leading whitespaces from next line
    while (pos < max) {
      ch1 = state.src.charCodeAt(pos);
      if (!isSpace(ch1)) break;
      pos++;
    }

    state.pos = pos;
    return true;
  }

  escapedStr = state.src[pos];

  if (ch1 >= 0xD800 && ch1 <= 0xDBFF && pos + 1 < max) {
    ch2 = state.src.charCodeAt(pos + 1);

    if (ch2 >= 0xDC00 && ch2 <= 0xDFFF) {
      escapedStr += state.src[pos + 1];
      pos++;
    }
  }

  origStr = '\\' + escapedStr;

  if (!silent) {
    token = state.push('text_special', '', 0);

    if (ch1 < 256 && ESCAPED[ch1] !== 0) {
      token.content = escapedStr;
    } else {
      token.content = origStr;
    }

    token.markup = origStr;
    token.info   = 'escape';
  }

  state.pos = pos + 1;
  return true;
};


/***/ }),

/***/ 9969:
/***/ ((module) => {

"use strict";
// Clean up tokens after emphasis and strikethrough postprocessing:
// merge adjacent text nodes into one and re-calculate all token levels
//
// This is necessary because initially emphasis delimiter markers (*, _, ~)
// are treated as their own separate text tokens. Then emphasis rule either
// leaves them as text (needed to merge with adjacent text) or turns them
// into opening/closing tags (which messes up levels inside).
//



module.exports = function fragments_join(state) {
  var curr, last,
      level = 0,
      tokens = state.tokens,
      max = state.tokens.length;

  for (curr = last = 0; curr < max; curr++) {
    // re-calculate levels after emphasis/strikethrough turns some text nodes
    // into opening/closing tags
    if (tokens[curr].nesting < 0) level--; // closing tag
    tokens[curr].level = level;
    if (tokens[curr].nesting > 0) level++; // opening tag

    if (tokens[curr].type === 'text' &&
        curr + 1 < max &&
        tokens[curr + 1].type === 'text') {

      // collapse two adjacent text nodes
      tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
    } else {
      if (curr !== last) { tokens[last] = tokens[curr]; }

      last++;
    }
  }

  if (curr !== last) {
    tokens.length = last;
  }
};


/***/ }),

/***/ 1779:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Process html tags




var HTML_TAG_RE = (__webpack_require__(1947)/* .HTML_TAG_RE */ .n);


function isLinkOpen(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
  return /^<\/a\s*>/i.test(str);
}


function isLetter(ch) {
  /*eslint no-bitwise:0*/
  var lc = ch | 0x20; // to lower case
  return (lc >= 0x61/* a */) && (lc <= 0x7a/* z */);
}


module.exports = function html_inline(state, silent) {
  var ch, match, max, token,
      pos = state.pos;

  if (!state.md.options.html) { return false; }

  // Check start
  max = state.posMax;
  if (state.src.charCodeAt(pos) !== 0x3C/* < */ ||
      pos + 2 >= max) {
    return false;
  }

  // Quick fail on second char
  ch = state.src.charCodeAt(pos + 1);
  if (ch !== 0x21/* ! */ &&
      ch !== 0x3F/* ? */ &&
      ch !== 0x2F/* / */ &&
      !isLetter(ch)) {
    return false;
  }

  match = state.src.slice(pos).match(HTML_TAG_RE);
  if (!match) { return false; }

  if (!silent) {
    token         = state.push('html_inline', '', 0);
    token.content = state.src.slice(pos, pos + match[0].length);

    if (isLinkOpen(token.content))  state.linkLevel++;
    if (isLinkClose(token.content)) state.linkLevel--;
  }
  state.pos += match[0].length;
  return true;
};


/***/ }),

/***/ 3006:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Process ![image](<src> "title")



var normalizeReference   = (__webpack_require__(7022).normalizeReference);
var isSpace              = (__webpack_require__(7022).isSpace);


module.exports = function image(state, silent) {
  var attrs,
      code,
      content,
      label,
      labelEnd,
      labelStart,
      pos,
      ref,
      res,
      title,
      token,
      tokens,
      start,
      href = '',
      oldPos = state.pos,
      max = state.posMax;

  if (state.src.charCodeAt(state.pos) !== 0x21/* ! */) { return false; }
  if (state.src.charCodeAt(state.pos + 1) !== 0x5B/* [ */) { return false; }

  labelStart = state.pos + 2;
  labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);

  // parser failed to find ']', so it's not a valid link
  if (labelEnd < 0) { return false; }

  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 0x28/* ( */) {
    //
    // Inline link
    //

    // [link](  <href>  "title"  )
    //        ^^ skipping these spaces
    pos++;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!isSpace(code) && code !== 0x0A) { break; }
    }
    if (pos >= max) { return false; }

    // [link](  <href>  "title"  )
    //          ^^^^^^ parsing link destination
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) {
        pos = res.pos;
      } else {
        href = '';
      }
    }

    // [link](  <href>  "title"  )
    //                ^^ skipping these spaces
    start = pos;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!isSpace(code) && code !== 0x0A) { break; }
    }

    // [link](  <href>  "title"  )
    //                  ^^^^^^^ parsing link title
    res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
    if (pos < max && start !== pos && res.ok) {
      title = res.str;
      pos = res.pos;

      // [link](  <href>  "title"  )
      //                         ^^ skipping these spaces
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (!isSpace(code) && code !== 0x0A) { break; }
      }
    } else {
      title = '';
    }

    if (pos >= max || state.src.charCodeAt(pos) !== 0x29/* ) */) {
      state.pos = oldPos;
      return false;
    }
    pos++;
  } else {
    //
    // Link reference
    //
    if (typeof state.env.references === 'undefined') { return false; }

    if (pos < max && state.src.charCodeAt(pos) === 0x5B/* [ */) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }

    // covers label === '' and label === undefined
    // (collapsed reference link and shortcut reference link respectively)
    if (!label) { label = state.src.slice(labelStart, labelEnd); }

    ref = state.env.references[normalizeReference(label)];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }

  //
  // We found the end of the link, and know for a fact it's a valid link;
  // so all that's left to do is to call tokenizer.
  //
  if (!silent) {
    content = state.src.slice(labelStart, labelEnd);

    state.md.inline.parse(
      content,
      state.md,
      state.env,
      tokens = []
    );

    token          = state.push('image', 'img', 0);
    token.attrs    = attrs = [ [ 'src', href ], [ 'alt', '' ] ];
    token.children = tokens;
    token.content  = content;

    if (title) {
      attrs.push([ 'title', title ]);
    }
  }

  state.pos = pos;
  state.posMax = max;
  return true;
};


/***/ }),

/***/ 1727:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Process [link](<to> "stuff")



var normalizeReference   = (__webpack_require__(7022).normalizeReference);
var isSpace              = (__webpack_require__(7022).isSpace);


module.exports = function link(state, silent) {
  var attrs,
      code,
      label,
      labelEnd,
      labelStart,
      pos,
      res,
      ref,
      token,
      href = '',
      title = '',
      oldPos = state.pos,
      max = state.posMax,
      start = state.pos,
      parseReference = true;

  if (state.src.charCodeAt(state.pos) !== 0x5B/* [ */) { return false; }

  labelStart = state.pos + 1;
  labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);

  // parser failed to find ']', so it's not a valid link
  if (labelEnd < 0) { return false; }

  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 0x28/* ( */) {
    //
    // Inline link
    //

    // might have found a valid shortcut link, disable reference parsing
    parseReference = false;

    // [link](  <href>  "title"  )
    //        ^^ skipping these spaces
    pos++;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!isSpace(code) && code !== 0x0A) { break; }
    }
    if (pos >= max) { return false; }

    // [link](  <href>  "title"  )
    //          ^^^^^^ parsing link destination
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) {
        pos = res.pos;
      } else {
        href = '';
      }

      // [link](  <href>  "title"  )
      //                ^^ skipping these spaces
      start = pos;
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (!isSpace(code) && code !== 0x0A) { break; }
      }

      // [link](  <href>  "title"  )
      //                  ^^^^^^^ parsing link title
      res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;

        // [link](  <href>  "title"  )
        //                         ^^ skipping these spaces
        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);
          if (!isSpace(code) && code !== 0x0A) { break; }
        }
      }
    }

    if (pos >= max || state.src.charCodeAt(pos) !== 0x29/* ) */) {
      // parsing a valid shortcut link failed, fallback to reference
      parseReference = true;
    }
    pos++;
  }

  if (parseReference) {
    //
    // Link reference
    //
    if (typeof state.env.references === 'undefined') { return false; }

    if (pos < max && state.src.charCodeAt(pos) === 0x5B/* [ */) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }

    // covers label === '' and label === undefined
    // (collapsed reference link and shortcut reference link respectively)
    if (!label) { label = state.src.slice(labelStart, labelEnd); }

    ref = state.env.references[normalizeReference(label)];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }

  //
  // We found the end of the link, and know for a fact it's a valid link;
  // so all that's left to do is to call tokenizer.
  //
  if (!silent) {
    state.pos = labelStart;
    state.posMax = labelEnd;

    token        = state.push('link_open', 'a', 1);
    token.attrs  = attrs = [ [ 'href', href ] ];
    if (title) {
      attrs.push([ 'title', title ]);
    }

    state.linkLevel++;
    state.md.inline.tokenize(state);
    state.linkLevel--;

    token        = state.push('link_close', 'a', -1);
  }

  state.pos = pos;
  state.posMax = max;
  return true;
};


/***/ }),

/***/ 2906:
/***/ ((module) => {

"use strict";
// Process links like https://example.org/




// RFC3986: scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
var SCHEME_RE = /(?:^|[^a-z0-9.+-])([a-z][a-z0-9.+-]*)$/i;


module.exports = function linkify(state, silent) {
  var pos, max, match, proto, link, url, fullUrl, token;

  if (!state.md.options.linkify) return false;
  if (state.linkLevel > 0) return false;

  pos = state.pos;
  max = state.posMax;

  if (pos + 3 > max) return false;
  if (state.src.charCodeAt(pos) !== 0x3A/* : */) return false;
  if (state.src.charCodeAt(pos + 1) !== 0x2F/* / */) return false;
  if (state.src.charCodeAt(pos + 2) !== 0x2F/* / */) return false;

  match = state.pending.match(SCHEME_RE);
  if (!match) return false;

  proto = match[1];

  link = state.md.linkify.matchAtStart(state.src.slice(pos - proto.length));
  if (!link) return false;

  url = link.url;

  // disallow '*' at the end of the link (conflicts with emphasis)
  url = url.replace(/\*+$/, '');

  fullUrl = state.md.normalizeLink(url);
  if (!state.md.validateLink(fullUrl)) return false;

  if (!silent) {
    state.pending = state.pending.slice(0, -proto.length);

    token         = state.push('link_open', 'a', 1);
    token.attrs   = [ [ 'href', fullUrl ] ];
    token.markup  = 'linkify';
    token.info    = 'auto';

    token         = state.push('text', '', 0);
    token.content = state.md.normalizeLinkText(url);

    token         = state.push('link_close', 'a', -1);
    token.markup  = 'linkify';
    token.info    = 'auto';
  }

  state.pos += url.length - proto.length;
  return true;
};


/***/ }),

/***/ 3905:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Proceess '\n'



var isSpace = (__webpack_require__(7022).isSpace);


module.exports = function newline(state, silent) {
  var pmax, max, ws, pos = state.pos;

  if (state.src.charCodeAt(pos) !== 0x0A/* \n */) { return false; }

  pmax = state.pending.length - 1;
  max = state.posMax;

  // '  \n' -> hardbreak
  // Lookup in pending chars is bad practice! Don't copy to other rules!
  // Pending string is stored in concat mode, indexed lookups will cause
  // convertion to flat mode.
  if (!silent) {
    if (pmax >= 0 && state.pending.charCodeAt(pmax) === 0x20) {
      if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 0x20) {
        // Find whitespaces tail of pending chars.
        ws = pmax - 1;
        while (ws >= 1 && state.pending.charCodeAt(ws - 1) === 0x20) ws--;

        state.pending = state.pending.slice(0, ws);
        state.push('hardbreak', 'br', 0);
      } else {
        state.pending = state.pending.slice(0, -1);
        state.push('softbreak', 'br', 0);
      }

    } else {
      state.push('softbreak', 'br', 0);
    }
  }

  pos++;

  // skip heading spaces for next line
  while (pos < max && isSpace(state.src.charCodeAt(pos))) { pos++; }

  state.pos = pos;
  return true;
};


/***/ }),

/***/ 670:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Inline parser state




var Token          = __webpack_require__(5872);
var isWhiteSpace   = (__webpack_require__(7022).isWhiteSpace);
var isPunctChar    = (__webpack_require__(7022).isPunctChar);
var isMdAsciiPunct = (__webpack_require__(7022).isMdAsciiPunct);


function StateInline(src, md, env, outTokens) {
  this.src = src;
  this.env = env;
  this.md = md;
  this.tokens = outTokens;
  this.tokens_meta = Array(outTokens.length);

  this.pos = 0;
  this.posMax = this.src.length;
  this.level = 0;
  this.pending = '';
  this.pendingLevel = 0;

  // Stores { start: end } pairs. Useful for backtrack
  // optimization of pairs parse (emphasis, strikes).
  this.cache = {};

  // List of emphasis-like delimiters for current tag
  this.delimiters = [];

  // Stack of delimiter lists for upper level tags
  this._prev_delimiters = [];

  // backtick length => last seen position
  this.backticks = {};
  this.backticksScanned = false;

  // Counter used to disable inline linkify-it execution
  // inside <a> and markdown links
  this.linkLevel = 0;
}


// Flush pending text
//
StateInline.prototype.pushPending = function () {
  var token = new Token('text', '', 0);
  token.content = this.pending;
  token.level = this.pendingLevel;
  this.tokens.push(token);
  this.pending = '';
  return token;
};


// Push new token to "stream".
// If pending text exists - flush it as text token
//
StateInline.prototype.push = function (type, tag, nesting) {
  if (this.pending) {
    this.pushPending();
  }

  var token = new Token(type, tag, nesting);
  var token_meta = null;

  if (nesting < 0) {
    // closing tag
    this.level--;
    this.delimiters = this._prev_delimiters.pop();
  }

  token.level = this.level;

  if (nesting > 0) {
    // opening tag
    this.level++;
    this._prev_delimiters.push(this.delimiters);
    this.delimiters = [];
    token_meta = { delimiters: this.delimiters };
  }

  this.pendingLevel = this.level;
  this.tokens.push(token);
  this.tokens_meta.push(token_meta);
  return token;
};


// Scan a sequence of emphasis-like markers, and determine whether
// it can start an emphasis sequence or end an emphasis sequence.
//
//  - start - position to scan from (it should point at a valid marker);
//  - canSplitWord - determine if these markers can be found inside a word
//
StateInline.prototype.scanDelims = function (start, canSplitWord) {
  var pos = start, lastChar, nextChar, count, can_open, can_close,
      isLastWhiteSpace, isLastPunctChar,
      isNextWhiteSpace, isNextPunctChar,
      left_flanking = true,
      right_flanking = true,
      max = this.posMax,
      marker = this.src.charCodeAt(start);

  // treat beginning of the line as a whitespace
  lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 0x20;

  while (pos < max && this.src.charCodeAt(pos) === marker) { pos++; }

  count = pos - start;

  // treat end of the line as a whitespace
  nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20;

  isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
  isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));

  isLastWhiteSpace = isWhiteSpace(lastChar);
  isNextWhiteSpace = isWhiteSpace(nextChar);

  if (isNextWhiteSpace) {
    left_flanking = false;
  } else if (isNextPunctChar) {
    if (!(isLastWhiteSpace || isLastPunctChar)) {
      left_flanking = false;
    }
  }

  if (isLastWhiteSpace) {
    right_flanking = false;
  } else if (isLastPunctChar) {
    if (!(isNextWhiteSpace || isNextPunctChar)) {
      right_flanking = false;
    }
  }

  if (!canSplitWord) {
    can_open  = left_flanking  && (!right_flanking || isLastPunctChar);
    can_close = right_flanking && (!left_flanking  || isNextPunctChar);
  } else {
    can_open  = left_flanking;
    can_close = right_flanking;
  }

  return {
    can_open:  can_open,
    can_close: can_close,
    length:    count
  };
};


// re-export Token class to use in block rules
StateInline.prototype.Token = Token;


module.exports = StateInline;


/***/ }),

/***/ 4814:
/***/ ((module) => {

"use strict";
// ~~strike through~~
//



// Insert each marker as a separate text token, and add it to delimiter list
//
module.exports.w = function strikethrough(state, silent) {
  var i, scanned, token, len, ch,
      start = state.pos,
      marker = state.src.charCodeAt(start);

  if (silent) { return false; }

  if (marker !== 0x7E/* ~ */) { return false; }

  scanned = state.scanDelims(state.pos, true);
  len = scanned.length;
  ch = String.fromCharCode(marker);

  if (len < 2) { return false; }

  if (len % 2) {
    token         = state.push('text', '', 0);
    token.content = ch;
    len--;
  }

  for (i = 0; i < len; i += 2) {
    token         = state.push('text', '', 0);
    token.content = ch + ch;

    state.delimiters.push({
      marker: marker,
      length: 0,     // disable "rule of 3" length checks meant for emphasis
      token:  state.tokens.length - 1,
      end:    -1,
      open:   scanned.can_open,
      close:  scanned.can_close
    });
  }

  state.pos += scanned.length;

  return true;
};


function postProcess(state, delimiters) {
  var i, j,
      startDelim,
      endDelim,
      token,
      loneMarkers = [],
      max = delimiters.length;

  for (i = 0; i < max; i++) {
    startDelim = delimiters[i];

    if (startDelim.marker !== 0x7E/* ~ */) {
      continue;
    }

    if (startDelim.end === -1) {
      continue;
    }

    endDelim = delimiters[startDelim.end];

    token         = state.tokens[startDelim.token];
    token.type    = 's_open';
    token.tag     = 's';
    token.nesting = 1;
    token.markup  = '~~';
    token.content = '';

    token         = state.tokens[endDelim.token];
    token.type    = 's_close';
    token.tag     = 's';
    token.nesting = -1;
    token.markup  = '~~';
    token.content = '';

    if (state.tokens[endDelim.token - 1].type === 'text' &&
        state.tokens[endDelim.token - 1].content === '~') {

      loneMarkers.push(endDelim.token - 1);
    }
  }

  // If a marker sequence has an odd number of characters, it's splitted
  // like this: `~~~~~` -> `~` + `~~` + `~~`, leaving one marker at the
  // start of the sequence.
  //
  // So, we have to move all those markers after subsequent s_close tags.
  //
  while (loneMarkers.length) {
    i = loneMarkers.pop();
    j = i + 1;

    while (j < state.tokens.length && state.tokens[j].type === 's_close') {
      j++;
    }

    j--;

    if (i !== j) {
      token = state.tokens[j];
      state.tokens[j] = state.tokens[i];
      state.tokens[i] = token;
    }
  }
}


// Walk through delimiter list and replace text tokens with tags
//
module.exports.g = function strikethrough(state) {
  var curr,
      tokens_meta = state.tokens_meta,
      max = state.tokens_meta.length;

  postProcess(state, state.delimiters);

  for (curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      postProcess(state, tokens_meta[curr].delimiters);
    }
  }
};


/***/ }),

/***/ 9941:
/***/ ((module) => {

"use strict";
// Skip text characters for text token, place those to pending buffer
// and increment current pos




// Rule to skip pure text
// '{}$%@~+=:' reserved for extentions

// !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~

// !!!! Don't confuse with "Markdown ASCII Punctuation" chars
// http://spec.commonmark.org/0.15/#ascii-punctuation-character
function isTerminatorChar(ch) {
  switch (ch) {
    case 0x0A/* \n */:
    case 0x21/* ! */:
    case 0x23/* # */:
    case 0x24/* $ */:
    case 0x25/* % */:
    case 0x26/* & */:
    case 0x2A/* * */:
    case 0x2B/* + */:
    case 0x2D/* - */:
    case 0x3A/* : */:
    case 0x3C/* < */:
    case 0x3D/* = */:
    case 0x3E/* > */:
    case 0x40/* @ */:
    case 0x5B/* [ */:
    case 0x5C/* \ */:
    case 0x5D/* ] */:
    case 0x5E/* ^ */:
    case 0x5F/* _ */:
    case 0x60/* ` */:
    case 0x7B/* { */:
    case 0x7D/* } */:
    case 0x7E/* ~ */:
      return true;
    default:
      return false;
  }
}

module.exports = function text(state, silent) {
  var pos = state.pos;

  while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) {
    pos++;
  }

  if (pos === state.pos) { return false; }

  if (!silent) { state.pending += state.src.slice(state.pos, pos); }

  state.pos = pos;

  return true;
};

// Alternative implementation, for memory.
//
// It costs 10% of performance, but allows extend terminators list, if place it
// to `ParcerInline` property. Probably, will switch to it sometime, such
// flexibility required.

/*
var TERMINATOR_RE = /[\n!#$%&*+\-:<=>@[\\\]^_`{}~]/;

module.exports = function text(state, silent) {
  var pos = state.pos,
      idx = state.src.slice(pos).search(TERMINATOR_RE);

  // first char is terminator -> empty text
  if (idx === 0) { return false; }

  // no terminator -> text till end of string
  if (idx < 0) {
    if (!silent) { state.pending += state.src.slice(pos); }
    state.pos = state.src.length;
    return true;
  }

  if (!silent) { state.pending += state.src.slice(pos, pos + idx); }

  state.pos += idx;

  return true;
};*/


/***/ }),

/***/ 5872:
/***/ ((module) => {

"use strict";
// Token class




/**
 * class Token
 **/

/**
 * new Token(type, tag, nesting)
 *
 * Create new token and fill passed properties.
 **/
function Token(type, tag, nesting) {
  /**
   * Token#type -> String
   *
   * Type of the token (string, e.g. "paragraph_open")
   **/
  this.type     = type;

  /**
   * Token#tag -> String
   *
   * html tag name, e.g. "p"
   **/
  this.tag      = tag;

  /**
   * Token#attrs -> Array
   *
   * Html attributes. Format: `[ [ name1, value1 ], [ name2, value2 ] ]`
   **/
  this.attrs    = null;

  /**
   * Token#map -> Array
   *
   * Source map info. Format: `[ line_begin, line_end ]`
   **/
  this.map      = null;

  /**
   * Token#nesting -> Number
   *
   * Level change (number in {-1, 0, 1} set), where:
   *
   * -  `1` means the tag is opening
   * -  `0` means the tag is self-closing
   * - `-1` means the tag is closing
   **/
  this.nesting  = nesting;

  /**
   * Token#level -> Number
   *
   * nesting level, the same as `state.level`
   **/
  this.level    = 0;

  /**
   * Token#children -> Array
   *
   * An array of child nodes (inline and img tokens)
   **/
  this.children = null;

  /**
   * Token#content -> String
   *
   * In a case of self-closing tag (code, html, fence, etc.),
   * it has contents of this tag.
   **/
  this.content  = '';

  /**
   * Token#markup -> String
   *
   * '*' or '_' for emphasis, fence string for fence, etc.
   **/
  this.markup   = '';

  /**
   * Token#info -> String
   *
   * Additional information:
   *
   * - Info string for "fence" tokens
   * - The value "auto" for autolink "link_open" and "link_close" tokens
   * - The string value of the item marker for ordered-list "list_item_open" tokens
   **/
  this.info     = '';

  /**
   * Token#meta -> Object
   *
   * A place for plugins to store an arbitrary data
   **/
  this.meta     = null;

  /**
   * Token#block -> Boolean
   *
   * True for block-level tokens, false for inline tokens.
   * Used in renderer to calculate line breaks
   **/
  this.block    = false;

  /**
   * Token#hidden -> Boolean
   *
   * If it's true, ignore this element when rendering. Used for tight lists
   * to hide paragraphs.
   **/
  this.hidden   = false;
}


/**
 * Token.attrIndex(name) -> Number
 *
 * Search attribute index by name.
 **/
Token.prototype.attrIndex = function attrIndex(name) {
  var attrs, i, len;

  if (!this.attrs) { return -1; }

  attrs = this.attrs;

  for (i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i][0] === name) { return i; }
  }
  return -1;
};


/**
 * Token.attrPush(attrData)
 *
 * Add `[ name, value ]` attribute to list. Init attrs if necessary
 **/
Token.prototype.attrPush = function attrPush(attrData) {
  if (this.attrs) {
    this.attrs.push(attrData);
  } else {
    this.attrs = [ attrData ];
  }
};


/**
 * Token.attrSet(name, value)
 *
 * Set `name` attribute to `value`. Override old value if exists.
 **/
Token.prototype.attrSet = function attrSet(name, value) {
  var idx = this.attrIndex(name),
      attrData = [ name, value ];

  if (idx < 0) {
    this.attrPush(attrData);
  } else {
    this.attrs[idx] = attrData;
  }
};


/**
 * Token.attrGet(name)
 *
 * Get the value of attribute `name`, or null if it does not exist.
 **/
Token.prototype.attrGet = function attrGet(name) {
  var idx = this.attrIndex(name), value = null;
  if (idx >= 0) {
    value = this.attrs[idx][1];
  }
  return value;
};


/**
 * Token.attrJoin(name, value)
 *
 * Join value to existing attribute via space. Or create new attribute if not
 * exists. Useful to operate with token classes.
 **/
Token.prototype.attrJoin = function attrJoin(name, value) {
  var idx = this.attrIndex(name);

  if (idx < 0) {
    this.attrPush([ name, value ]);
  } else {
    this.attrs[idx][1] = this.attrs[idx][1] + ' ' + value;
  }
};


module.exports = Token;


/***/ }),

/***/ 3122:
/***/ ((module) => {

"use strict";




/* eslint-disable no-bitwise */

var decodeCache = {};

function getDecodeCache(exclude) {
  var i, ch, cache = decodeCache[exclude];
  if (cache) { return cache; }

  cache = decodeCache[exclude] = [];

  for (i = 0; i < 128; i++) {
    ch = String.fromCharCode(i);
    cache.push(ch);
  }

  for (i = 0; i < exclude.length; i++) {
    ch = exclude.charCodeAt(i);
    cache[ch] = '%' + ('0' + ch.toString(16).toUpperCase()).slice(-2);
  }

  return cache;
}


// Decode percent-encoded string.
//
function decode(string, exclude) {
  var cache;

  if (typeof exclude !== 'string') {
    exclude = decode.defaultChars;
  }

  cache = getDecodeCache(exclude);

  return string.replace(/(%[a-f0-9]{2})+/gi, function(seq) {
    var i, l, b1, b2, b3, b4, chr,
        result = '';

    for (i = 0, l = seq.length; i < l; i += 3) {
      b1 = parseInt(seq.slice(i + 1, i + 3), 16);

      if (b1 < 0x80) {
        result += cache[b1];
        continue;
      }

      if ((b1 & 0xE0) === 0xC0 && (i + 3 < l)) {
        // 110xxxxx 10xxxxxx
        b2 = parseInt(seq.slice(i + 4, i + 6), 16);

        if ((b2 & 0xC0) === 0x80) {
          chr = ((b1 << 6) & 0x7C0) | (b2 & 0x3F);

          if (chr < 0x80) {
            result += '\ufffd\ufffd';
          } else {
            result += String.fromCharCode(chr);
          }

          i += 3;
          continue;
        }
      }

      if ((b1 & 0xF0) === 0xE0 && (i + 6 < l)) {
        // 1110xxxx 10xxxxxx 10xxxxxx
        b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        b3 = parseInt(seq.slice(i + 7, i + 9), 16);

        if ((b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
          chr = ((b1 << 12) & 0xF000) | ((b2 << 6) & 0xFC0) | (b3 & 0x3F);

          if (chr < 0x800 || (chr >= 0xD800 && chr <= 0xDFFF)) {
            result += '\ufffd\ufffd\ufffd';
          } else {
            result += String.fromCharCode(chr);
          }

          i += 6;
          continue;
        }
      }

      if ((b1 & 0xF8) === 0xF0 && (i + 9 < l)) {
        // 111110xx 10xxxxxx 10xxxxxx 10xxxxxx
        b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        b3 = parseInt(seq.slice(i + 7, i + 9), 16);
        b4 = parseInt(seq.slice(i + 10, i + 12), 16);

        if ((b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80 && (b4 & 0xC0) === 0x80) {
          chr = ((b1 << 18) & 0x1C0000) | ((b2 << 12) & 0x3F000) | ((b3 << 6) & 0xFC0) | (b4 & 0x3F);

          if (chr < 0x10000 || chr > 0x10FFFF) {
            result += '\ufffd\ufffd\ufffd\ufffd';
          } else {
            chr -= 0x10000;
            result += String.fromCharCode(0xD800 + (chr >> 10), 0xDC00 + (chr & 0x3FF));
          }

          i += 9;
          continue;
        }
      }

      result += '\ufffd';
    }

    return result;
  });
}


decode.defaultChars   = ';/?:@&=+$,#';
decode.componentChars = '';


module.exports = decode;


/***/ }),

/***/ 729:
/***/ ((module) => {

"use strict";




var encodeCache = {};


// Create a lookup array where anything but characters in `chars` string
// and alphanumeric chars is percent-encoded.
//
function getEncodeCache(exclude) {
  var i, ch, cache = encodeCache[exclude];
  if (cache) { return cache; }

  cache = encodeCache[exclude] = [];

  for (i = 0; i < 128; i++) {
    ch = String.fromCharCode(i);

    if (/^[0-9a-z]$/i.test(ch)) {
      // always allow unencoded alphanumeric characters
      cache.push(ch);
    } else {
      cache.push('%' + ('0' + i.toString(16).toUpperCase()).slice(-2));
    }
  }

  for (i = 0; i < exclude.length; i++) {
    cache[exclude.charCodeAt(i)] = exclude[i];
  }

  return cache;
}


// Encode unsafe characters with percent-encoding, skipping already
// encoded sequences.
//
//  - string       - string to encode
//  - exclude      - list of characters to ignore (in addition to a-zA-Z0-9)
//  - keepEscaped  - don't encode '%' in a correct escape sequence (default: true)
//
function encode(string, exclude, keepEscaped) {
  var i, l, code, nextCode, cache,
      result = '';

  if (typeof exclude !== 'string') {
    // encode(string, keepEscaped)
    keepEscaped  = exclude;
    exclude = encode.defaultChars;
  }

  if (typeof keepEscaped === 'undefined') {
    keepEscaped = true;
  }

  cache = getEncodeCache(exclude);

  for (i = 0, l = string.length; i < l; i++) {
    code = string.charCodeAt(i);

    if (keepEscaped && code === 0x25 /* % */ && i + 2 < l) {
      if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
        result += string.slice(i, i + 3);
        i += 2;
        continue;
      }
    }

    if (code < 128) {
      result += cache[code];
      continue;
    }

    if (code >= 0xD800 && code <= 0xDFFF) {
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < l) {
        nextCode = string.charCodeAt(i + 1);
        if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
          result += encodeURIComponent(string[i] + string[i + 1]);
          i++;
          continue;
        }
      }
      result += '%EF%BF%BD';
      continue;
    }

    result += encodeURIComponent(string[i]);
  }

  return result;
}

encode.defaultChars   = ";/?:@&=+$,-_.!~*'()#";
encode.componentChars = "-_.!~*'()";


module.exports = encode;


/***/ }),

/***/ 2201:
/***/ ((module) => {

"use strict";




module.exports = function format(url) {
  var result = '';

  result += url.protocol || '';
  result += url.slashes ? '//' : '';
  result += url.auth ? url.auth + '@' : '';

  if (url.hostname && url.hostname.indexOf(':') !== -1) {
    // ipv6 address
    result += '[' + url.hostname + ']';
  } else {
    result += url.hostname || '';
  }

  result += url.port ? ':' + url.port : '';
  result += url.pathname || '';
  result += url.search || '';
  result += url.hash || '';

  return result;
};


/***/ }),

/***/ 8765:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";



module.exports.encode = __webpack_require__(729);
module.exports.decode = __webpack_require__(3122);
module.exports.format = __webpack_require__(2201);
module.exports.parse = __webpack_require__(9553);


/***/ }),

/***/ 9553:
/***/ ((module) => {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.



//
// Changes from joyent/node:
//
// 1. No leading slash in paths,
//    e.g. in `url.parse('http://foo?bar')` pathname is ``, not `/`
//
// 2. Backslashes are not replaced with slashes,
//    so `http:\\example.org\` is treated like a relative path
//
// 3. Trailing colon is treated like a part of the path,
//    i.e. in `http://example.org:foo` pathname is `:foo`
//
// 4. Nothing is URL-encoded in the resulting object,
//    (in joyent/node some chars in auth and paths are encoded)
//
// 5. `url.parse()` does not have `parseQueryString` argument
//
// 6. Removed extraneous result properties: `host`, `path`, `query`, etc.,
//    which can be constructed using other parts of the url.
//


function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.pathname = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = [ '<', '>', '"', '`', ' ', '\r', '\n', '\t' ],

    // RFC 2396: characters not allowed for various reasons.
    unwise = [ '{', '}', '|', '\\', '^', '`' ].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = [ '\'' ].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = [ '%', '/', '?', ';', '#' ].concat(autoEscape),
    hostEndingChars = [ '/', '?', '#' ],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    /* eslint-disable no-script-url */
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    };
    /* eslint-enable no-script-url */

function urlParse(url, slashesDenoteHost) {
  if (url && url instanceof Url) { return url; }

  var u = new Url();
  u.parse(url, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, slashesDenoteHost) {
  var i, l, lowerProto, hec, slashes,
      rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    lowerProto = proto.toLowerCase();
    this.protocol = proto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (i = 0; i < hostEndingChars.length; i++) {
      hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = auth;
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (i = 0; i < nonHostChars.length; i++) {
      hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1) {
      hostEnd = rest.length;
    }

    if (rest[hostEnd - 1] === ':') { hostEnd--; }
    var host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost(host);

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) { continue; }
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    }

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
    }
  }

  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    rest = rest.slice(0, qm);
  }
  if (rest) { this.pathname = rest; }
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '';
  }

  return this;
};

Url.prototype.parseHost = function(host) {
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) { this.hostname = host; }
};

module.exports = urlParse;


/***/ }),

/***/ 8221:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Aggregator = void 0;
var core_1 = __webpack_require__(7424);
var lazy_1 = __webpack_require__(1088);
var util_1 = __webpack_require__(6588);
/**
 * Provides functionality for the mongoDB aggregation pipeline
 *
 * @param pipeline an Array of pipeline operators
 * @param options An optional Options to pass the aggregator
 * @constructor
 */
var Aggregator = /** @class */ (function () {
    function Aggregator(pipeline, options) {
        this.pipeline = pipeline;
        this.options = options;
        this.options = (0, core_1.initOptions)(options);
    }
    /**
     * Returns an `Lazy` iterator for processing results of pipeline
     *
     * @param {*} collection An array or iterator object
     * @param {Query} query the `Query` object to use as context
     * @returns {Iterator} an iterator object
     */
    Aggregator.prototype.stream = function (collection) {
        var iterator = (0, lazy_1.Lazy)(collection);
        var mode = this.options.processingMode;
        if (mode == core_1.ProcessingMode.CLONE_ALL ||
            mode == core_1.ProcessingMode.CLONE_INPUT) {
            iterator.map(util_1.cloneDeep);
        }
        var pipelineOperators = [];
        if (!(0, util_1.isEmpty)(this.pipeline)) {
            // run aggregation pipeline
            for (var _i = 0, _a = this.pipeline; _i < _a.length; _i++) {
                var operator = _a[_i];
                var operatorKeys = Object.keys(operator);
                var op = operatorKeys[0];
                var call = (0, core_1.getOperator)(core_1.OperatorType.PIPELINE, op);
                (0, util_1.assert)(operatorKeys.length === 1 && !!call, "invalid aggregation operator " + op);
                pipelineOperators.push(op);
                iterator = call(iterator, operator[op], this.options);
            }
        }
        // operators that may share object graphs of inputs.
        // we only need to clone the output for these since the objects will already be distinct for other operators.
        if (mode == core_1.ProcessingMode.CLONE_OUTPUT ||
            (mode == core_1.ProcessingMode.CLONE_ALL &&
                !!(0, util_1.intersection)([["$group", "$unwind"], pipelineOperators]).length)) {
            iterator.map(util_1.cloneDeep);
        }
        return iterator;
    };
    /**
     * Return the results of the aggregation as an array.
     *
     * @param {*} collection
     * @param {*} query
     */
    Aggregator.prototype.run = function (collection) {
        return this.stream(collection).value();
    };
    return Aggregator;
}());
exports.Aggregator = Aggregator;


/***/ }),

/***/ 7424:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.redact = exports.computeValue = exports.getOperator = exports.useOperators = exports.OperatorType = exports.initOptions = exports.ProcessingMode = void 0;
var util_1 = __webpack_require__(6588);
/**
 * This controls how input and output documents are processed to meet different application needs.
 * Each mode has different trade offs for; immutability, reference sharing, and performance.
 */
var ProcessingMode;
(function (ProcessingMode) {
    /**
     * Clone inputs prior to processing, and the outputs if some objects graphs may be shared.
     * Use this option to keep input collection immutable and to get distinct output objects.
     *
     * Note: This option is expensive and reduces performance.
     */
    ProcessingMode["CLONE_ALL"] = "CLONE_ALL";
    /**
     * Clones inputs prior to processing.
     * This option will return output objects with shared graphs in their path if specific operators are used.
     * Use this option to keep the input collection immutable.
     *
     */
    ProcessingMode["CLONE_INPUT"] = "CLONE_INPUT";
    /**
     * Clones the output to return distinct objects with no shared paths.
     * This option modifies the input collection and during processing.
     */
    ProcessingMode["CLONE_OUTPUT"] = "CLONE_OUTPUT";
    /**
     * Turn off cloning and modifies the input collection as needed.
     * This option will also return output objects with shared paths in their graph when specific operators are used.
     *
     * This option provides the greatest speedup for the biggest tradeoff. When using the aggregation pipeline, you can use
     * the "$out" operator to collect immutable intermediate results.
     *
     * @default
     */
    ProcessingMode["CLONE_OFF"] = "CLONE_OFF";
})(ProcessingMode = exports.ProcessingMode || (exports.ProcessingMode = {}));
/**
 * Creates an Option from another required keys are initialized
 * @param options Options
 */
function initOptions(options) {
    return Object.freeze(__assign({ idKey: "_id", scriptEnabled: true, useStrictMode: true, processingMode: ProcessingMode.CLONE_OFF, currentTimestamp: Date.now() }, options));
}
exports.initOptions = initOptions;
/**
 * The different groups of operators
 */
var OperatorType;
(function (OperatorType) {
    OperatorType["ACCUMULATOR"] = "accumulator";
    OperatorType["EXPRESSION"] = "expression";
    OperatorType["PIPELINE"] = "pipeline";
    OperatorType["PROJECTION"] = "projection";
    OperatorType["QUERY"] = "query";
    OperatorType["WINDOW"] = "window";
})(OperatorType = exports.OperatorType || (exports.OperatorType = {}));
// operator definitions
var OPERATORS = (_a = {},
    _a[OperatorType.ACCUMULATOR] = {},
    _a[OperatorType.EXPRESSION] = {},
    _a[OperatorType.PIPELINE] = {},
    _a[OperatorType.PROJECTION] = {},
    _a[OperatorType.QUERY] = {},
    _a[OperatorType.WINDOW] = {},
    _a);
/**
 * Register fully specified operators for the given operator class.
 *
 * @param type The operator type
 * @param operators Map of the operators
 */
function useOperators(type, operators) {
    for (var _i = 0, _a = Object.entries(operators); _i < _a.length; _i++) {
        var _b = _a[_i], name_1 = _b[0], func = _b[1];
        (0, util_1.assert)(func instanceof Function && (0, util_1.isOperator)(name_1), "'" + name_1 + "' is not a valid operator");
        // const call = getOperator(type, name);
        // assert(!call, `${name} already exists for '${type}' operators`);
    }
    // toss the operator salad :)
    (0, util_1.into)(OPERATORS[type], operators);
}
exports.useOperators = useOperators;
/**
 * Returns the operator function or null if it is not found
 * @param type Type of operator
 * @param operator Name of the operator
 */
function getOperator(type, operator) {
    return OPERATORS[type][operator];
}
exports.getOperator = getOperator;
/* eslint-disable unused-imports/no-unused-vars-ts */
/**
 * Implementation of system variables
 * @type {Object}
 */
var systemVariables = {
    $$ROOT: function (obj, expr, options) {
        return options.root;
    },
    $$CURRENT: function (obj, expr, options) {
        return obj;
    },
    $$REMOVE: function (obj, expr, options) {
        return undefined;
    },
    $$NOW: function (obj, expr, options) {
        return new Date(options.currentTimestamp);
    },
};
/**
 * Implementation of $redact variables
 *
 * Each function accepts 3 arguments (obj, expr, options)
 *
 * @type {Object}
 */
var redactVariables = {
    $$KEEP: function (obj, expr, options) {
        return obj;
    },
    $$PRUNE: function (obj, expr, options) {
        return undefined;
    },
    $$DESCEND: function (obj, expr, options) {
        // traverse nested documents iff there is a $cond
        if (!(0, util_1.has)(expr, "$cond"))
            return obj;
        var result;
        for (var _i = 0, _a = Object.entries(obj); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], current = _b[1];
            if ((0, util_1.isObjectLike)(current)) {
                if (current instanceof Array) {
                    var array = [];
                    for (var _c = 0, current_1 = current; _c < current_1.length; _c++) {
                        var elem = current_1[_c];
                        if ((0, util_1.isObject)(elem)) {
                            elem = redact(elem, expr, options);
                        }
                        if (!(0, util_1.isNil)(elem)) {
                            array.push(elem);
                        }
                    }
                    result = array;
                }
                else {
                    result = redact(current, expr, options);
                }
                if ((0, util_1.isNil)(result)) {
                    delete obj[key]; // pruned result
                }
                else {
                    obj[key] = result;
                }
            }
        }
        return obj;
    },
};
/* eslint-enable unused-imports/no-unused-vars-ts */
/**
 * Computes the value of the expression on the object for the given operator
 *
 * @param obj the current object from the collection
 * @param expr the expression for the given field
 * @param operator the operator to resolve the field with
 * @param options {Object} extra options
 * @returns {*}
 */
function computeValue(obj, expr, operator, options) {
    // ensure valid options exist on first invocation
    options = options || initOptions();
    if ((0, util_1.isOperator)(operator)) {
        // if the field of the object is a valid operator
        var call = getOperator(OperatorType.EXPRESSION, operator);
        if (call)
            return call(obj, expr, options);
        // we also handle $group accumulator operators
        call = getOperator(OperatorType.ACCUMULATOR, operator);
        if (call) {
            // if object is not an array, first try to compute using the expression
            if (!(obj instanceof Array)) {
                obj = computeValue(obj, expr, null, options);
                expr = null;
            }
            // validate that we have an array
            (0, util_1.assert)(obj instanceof Array, "'" + operator + "' target must be an array.");
            // we pass a null expression because all values have been resolved
            return call(obj, expr, options);
        }
        // operator was not found
        throw new Error("operator '" + operator + "' is not registered");
    }
    // if expr is a variable for an object field
    // field not used in this case
    if ((0, util_1.isString)(expr) && expr.length > 0 && expr[0] === "$") {
        // we return redact variables as literals
        if ((0, util_1.has)(redactVariables, expr)) {
            return expr;
        }
        // handle selectors with explicit prefix
        var arr = expr.split(".");
        if ((0, util_1.has)(systemVariables, arr[0])) {
            // set 'root' only the first time it is required to be used for all subsequent calls
            // if it already available on the options, it will be used
            obj = systemVariables[arr[0]](obj, null, __assign({ root: obj }, options));
            if (arr.length == 1)
                return obj;
            expr = expr.substr(arr[0].length); // '.' prefix will be sliced off below
        }
        return (0, util_1.resolve)(obj, expr.slice(1));
    }
    // check and return value if already in a resolved state
    if (expr instanceof Array) {
        return expr.map(function (item) {
            return computeValue(obj, item, null, options);
        });
    }
    else if ((0, util_1.isObject)(expr)) {
        var result = {};
        var _loop_1 = function (key, val) {
            result[key] = computeValue(obj, val, key, options);
            // must run ONLY one aggregate operator per expression
            // if so, return result of the computed value
            if ([OperatorType.EXPRESSION, OperatorType.ACCUMULATOR].some(function (c) {
                return (0, util_1.has)(OPERATORS[c], key);
            })) {
                // there should be only one operator
                (0, util_1.assert)(Object.keys(expr).length === 1, "Invalid aggregation expression '" + JSON.stringify(expr) + "'");
                return { value: result[key] };
            }
        };
        for (var _i = 0, _a = Object.entries(expr); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], val = _b[1];
            var state_1 = _loop_1(key, val);
            if (typeof state_1 === "object")
                return state_1.value;
        }
        return result;
    }
    return expr;
}
exports.computeValue = computeValue;
/**
 * Redact an object
 * @param  {Object} obj The object to redact
 * @param  {*} expr The redact expression
 * @param  {*} options  Options for value
 * @return {*} returns the result of the redacted object
 */
function redact(obj, expr, options) {
    var result = computeValue(obj, expr, null, options);
    return (0, util_1.has)(redactVariables, result)
        ? redactVariables[result](obj, expr, __assign({ root: obj }, options))
        : result;
}
exports.redact = redact;


/***/ }),

/***/ 9537:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Cursor = void 0;
var aggregator_1 = __webpack_require__(8221);
var lazy_1 = __webpack_require__(1088);
var util_1 = __webpack_require__(6588);
/**
 * Cursor to iterate and perform filtering on matched objects.
 * This object must not be used directly. A cursor may be obtaine from calling `find()` on an instance of `Query`.
 *
 * @param collection The input source of the collection
 * @param predicate A predicate function to test documents
 * @param projection A projection criteria
 * @param options Options
 * @constructor
 */
var Cursor = /** @class */ (function () {
    function Cursor(source, predicate, projection, options) {
        this.source = source;
        this.predicate = predicate;
        this.projection = projection;
        this.options = options;
        this.operators = [];
        this.result = null;
        this.buffer = [];
    }
    /** Returns the iterator from running the query */
    Cursor.prototype.fetch = function () {
        if (this.result)
            return this.result;
        // add projection operator
        if ((0, util_1.isObject)(this.projection)) {
            this.operators.push({ $project: this.projection });
        }
        // filter collection
        this.result = (0, lazy_1.Lazy)(this.source).filter(this.predicate);
        if (this.operators.length > 0) {
            this.result = new aggregator_1.Aggregator(this.operators, this.options).stream(this.result);
        }
        return this.result;
    };
    /** Returns an iterator with the buffered data included */
    Cursor.prototype.fetchAll = function () {
        var buffered = (0, lazy_1.Lazy)(__spreadArray([], this.buffer, true));
        this.buffer = [];
        return (0, lazy_1.compose)(buffered, this.fetch());
    };
    /**
     * Return remaining objects in the cursor as an array. This method exhausts the cursor
     * @returns {Array}
     */
    Cursor.prototype.all = function () {
        return this.fetchAll().value();
    };
    /**
     * Returns the number of objects return in the cursor. This method exhausts the cursor
     * @returns {Number}
     */
    Cursor.prototype.count = function () {
        return this.all().length;
    };
    /**
     * Returns a cursor that begins returning results only after passing or skipping a number of documents.
     * @param {Number} n the number of results to skip.
     * @return {Cursor} Returns the cursor, so you can chain this call.
     */
    Cursor.prototype.skip = function (n) {
        this.operators.push({ $skip: n });
        return this;
    };
    /**
     * Constrains the size of a cursor's result set.
     * @param {Number} n the number of results to limit to.
     * @return {Cursor} Returns the cursor, so you can chain this call.
     */
    Cursor.prototype.limit = function (n) {
        this.operators.push({ $limit: n });
        return this;
    };
    /**
     * Returns results ordered according to a sort specification.
     * @param {Object} modifier an object of key and values specifying the sort order. 1 for ascending and -1 for descending
     * @return {Cursor} Returns the cursor, so you can chain this call.
     */
    Cursor.prototype.sort = function (modifier) {
        this.operators.push({ $sort: modifier });
        return this;
    };
    /**
     * Specifies the collation for the cursor returned by the `mingo.Query.find`
     * @param {*} spec
     */
    Cursor.prototype.collation = function (spec) {
        this.options = __assign(__assign({}, this.options), { collation: spec });
        return this;
    };
    /**
     * Returns the next document in a cursor.
     * @returns {Object | Boolean}
     */
    Cursor.prototype.next = function () {
        // yield value obtains in hasNext()
        if (this.buffer.length > 0) {
            return this.buffer.pop();
        }
        var o = this.fetch().next();
        if (o.done)
            return;
        return o.value;
    };
    /**
     * Returns true if the cursor has documents and can be iterated.
     * @returns {boolean}
     */
    Cursor.prototype.hasNext = function () {
        // there is a value in the buffer
        if (this.buffer.length > 0)
            return true;
        var o = this.fetch().next();
        if (o.done)
            return false;
        this.buffer.push(o.value);
        return true;
    };
    /**
     * Applies a function to each document in a cursor and collects the return values in an array.
     * @param callback
     * @returns {Array}
     */
    Cursor.prototype.map = function (callback) {
        return this.all().map(callback);
    };
    /**
     * Applies a JavaScript function for every document in a cursor.
     * @param callback
     */
    Cursor.prototype.forEach = function (callback) {
        this.all().forEach(callback);
    };
    Cursor.prototype[Symbol.iterator] = function () {
        return this.fetchAll();
    };
    return Cursor;
}());
exports.Cursor = Cursor;


/***/ }),

/***/ 4406:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.aggregate = exports.remove = exports.find = exports.Query = exports.Aggregator = void 0;
// loads basic operators
__webpack_require__(7532);
var aggregator_1 = __webpack_require__(8221);
var query_1 = __webpack_require__(7732);
var aggregator_2 = __webpack_require__(8221);
Object.defineProperty(exports, "Aggregator", ({ enumerable: true, get: function () { return aggregator_2.Aggregator; } }));
var query_2 = __webpack_require__(7732);
Object.defineProperty(exports, "Query", ({ enumerable: true, get: function () { return query_2.Query; } }));
/**
 * Performs a query on a collection and returns a cursor object.
 * Shorthand for `Query(criteria).find(collection, projection)`
 *
 * @param collection Array of objects
 * @param criteria Query criteria
 * @param projection Projection criteria
 * @param options
 * @returns {Cursor} A cursor of results
 */
function find(collection, criteria, projection, options) {
    return new query_1.Query(criteria, options).find(collection, projection);
}
exports.find = find;
/**
 * Returns a new array without objects which match the criteria
 *
 * @param collection Array of objects
 * @param criteria Query criteria of objects to remove
 * @param options
 * @returns {Array} New filtered array
 */
function remove(collection, criteria, options) {
    return new query_1.Query(criteria, options).remove(collection);
}
exports.remove = remove;
/**
 * Return the result collection after running the aggregation pipeline for the given collection.
 * Shorthand for `(new Aggregator(pipeline, options)).run(collection)`
 *
 * @param collection array or stream of objects
 * @param pipeline The pipeline operators to use
 * @param options
 * @returns {Array} New array of results
 */
function aggregate(collection, pipeline, options) {
    return new aggregator_1.Aggregator(pipeline, options).run(collection);
}
exports.aggregate = aggregate;
// default interface
exports["default"] = {
    Aggregator: aggregator_1.Aggregator,
    Query: query_1.Query,
    aggregate: aggregate,
    find: find,
    remove: remove,
};


/***/ }),

/***/ 7532:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
/**
 * Loads all Query and Projection operators
 */
var core_1 = __webpack_require__(7424);
var booleanOperators = __importStar(__webpack_require__(5039));
var comparisonOperators = __importStar(__webpack_require__(6312));
var pipeline_1 = __webpack_require__(1091);
var projectionOperators = __importStar(__webpack_require__(7086));
var queryOperators = __importStar(__webpack_require__(581));
(0, core_1.useOperators)(core_1.OperatorType.EXPRESSION, __assign(__assign({}, booleanOperators), comparisonOperators));
(0, core_1.useOperators)(core_1.OperatorType.PIPELINE, { $project: pipeline_1.$project, $skip: pipeline_1.$skip, $limit: pipeline_1.$limit, $sort: pipeline_1.$sort });
(0, core_1.useOperators)(core_1.OperatorType.PROJECTION, projectionOperators);
(0, core_1.useOperators)(core_1.OperatorType.QUERY, queryOperators);


/***/ }),

/***/ 1088:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Iterator = exports.compose = exports.Lazy = void 0;
/**
 * Returns an iterator
 * @param {*} source An iterable source (Array, Function, Generator, or Iterator)
 */
function Lazy(source) {
    return source instanceof Iterator ? source : new Iterator(source);
}
exports.Lazy = Lazy;
function compose() {
    var iterators = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        iterators[_i] = arguments[_i];
    }
    var index = 0;
    return Lazy(function () {
        while (index < iterators.length) {
            var o = iterators[index].next();
            if (!o.done)
                return o;
            index++;
        }
        return { done: true };
    });
}
exports.compose = compose;
/**
 * Checks whether the given object is compatible with a generator i.e Object{next:Function}
 * @param {*} o An object
 */
function isGenerator(o) {
    var _a;
    return (!!o && typeof o === "object" && ((_a = o) === null || _a === void 0 ? void 0 : _a.next) instanceof Function);
}
function dropItem(array, i) {
    var rest = array.slice(i + 1);
    array.splice(i);
    Array.prototype.push.apply(array, rest);
}
// stop iteration error
var DONE = new Error();
// Lazy function actions
var Action;
(function (Action) {
    Action[Action["MAP"] = 0] = "MAP";
    Action[Action["FILTER"] = 1] = "FILTER";
    Action[Action["TAKE"] = 2] = "TAKE";
    Action[Action["DROP"] = 3] = "DROP";
})(Action || (Action = {}));
function createCallback(nextFn, iteratees, buffer) {
    var done = false;
    var index = -1;
    var bufferIndex = 0; // index for the buffer
    return function (storeResult) {
        // special hack to collect all values into buffer
        try {
            outer: while (!done) {
                var o = nextFn();
                index++;
                var i = -1;
                var size = iteratees.length;
                var innerDone = false;
                while (++i < size) {
                    var r = iteratees[i];
                    switch (r.action) {
                        case Action.MAP:
                            o = r.func(o, index);
                            break;
                        case Action.FILTER:
                            if (!r.func(o, index))
                                continue outer;
                            break;
                        case Action.TAKE:
                            --r.count;
                            if (!r.count)
                                innerDone = true;
                            break;
                        case Action.DROP:
                            --r.count;
                            if (!r.count)
                                dropItem(iteratees, i);
                            continue outer;
                        default:
                            break outer;
                    }
                }
                done = innerDone;
                if (storeResult) {
                    buffer[bufferIndex++] = o;
                }
                else {
                    return { value: o, done: false };
                }
            }
        }
        catch (e) {
            if (e !== DONE)
                throw e;
        }
        done = true;
        return { done: done };
    };
}
/**
 * A lazy collection iterator yields a single value at time upon request
 */
var Iterator = /** @class */ (function () {
    /**
     * @param {*} source An iterable object or function.
     *    Array - return one element per cycle
     *    Object{next:Function} - call next() for the next value (this also handles generator functions)
     *    Function - call to return the next value
     * @param {Function} fn An optional transformation function
     */
    function Iterator(source) {
        this.iteratees = [];
        this.yieldedValues = [];
        this.isDone = false;
        var nextVal;
        if (source instanceof Function) {
            // make iterable
            source = { next: source };
        }
        if (isGenerator(source)) {
            var src_1 = source;
            nextVal = function () {
                var o = src_1.next();
                if (o.done)
                    throw DONE;
                return o.value;
            };
        }
        else if (source instanceof Array) {
            var data_1 = source;
            var size_1 = data_1.length;
            var index_1 = 0;
            nextVal = function () {
                if (index_1 < size_1)
                    return data_1[index_1++];
                throw DONE;
            };
        }
        else if (!(source instanceof Function)) {
            throw new Error("Source is of type '" + typeof source + "'. Must be Array, Function, or Generator");
        }
        // create next function
        this.getNext = createCallback(nextVal, this.iteratees, this.yieldedValues);
    }
    /**
     * Add an iteratee to this lazy sequence
     */
    Iterator.prototype.push = function (action, value) {
        if (typeof value === "function") {
            this.iteratees.push({ action: action, func: value });
        }
        else if (typeof value === "number") {
            this.iteratees.push({ action: action, count: value });
        }
        return this;
    };
    Iterator.prototype.next = function () {
        return this.getNext();
    };
    // Iteratees methods
    /**
     * Transform each item in the sequence to a new value
     * @param {Function} f
     */
    Iterator.prototype.map = function (f) {
        return this.push(Action.MAP, f);
    };
    /**
     * Select only items matching the given predicate
     * @param {Function} pred
     */
    Iterator.prototype.filter = function (predicate) {
        return this.push(Action.FILTER, predicate);
    };
    /**
     * Take given numbe for values from sequence
     * @param {Number} n A number greater than 0
     */
    Iterator.prototype.take = function (n) {
        return n > 0 ? this.push(Action.TAKE, n) : this;
    };
    /**
     * Drop a number of values from the sequence
     * @param {Number} n Number of items to drop greater than 0
     */
    Iterator.prototype.drop = function (n) {
        return n > 0 ? this.push(Action.DROP, n) : this;
    };
    // Transformations
    /**
     * Returns a new lazy object with results of the transformation
     * The entire sequence is realized.
     *
     * @param {Function} fn Tranform function of type (Array) => (Any)
     */
    Iterator.prototype.transform = function (fn) {
        var self = this;
        var iter;
        return Lazy(function () {
            if (!iter) {
                iter = Lazy(fn(self.value()));
            }
            return iter.next();
        });
    };
    // Terminal methods
    /**
     * Returns the fully realized values of the iterators.
     * The return value will be an array unless `lazy.first()` was used.
     * The realized values are cached for subsequent calls
     */
    Iterator.prototype.value = function () {
        if (!this.isDone) {
            this.isDone = this.getNext(true).done;
        }
        return this.yieldedValues;
    };
    /**
     * Execute the funcion for each value. Will stop when an execution returns false.
     * @param {Function} f
     * @returns {Boolean} false iff `f` return false for AnyVal execution, otherwise true
     */
    Iterator.prototype.each = function (f) {
        for (;;) {
            var o = this.next();
            if (o.done)
                break;
            if (f(o.value) === false)
                return false;
        }
        return true;
    };
    /**
     * Returns the reduction of sequence according the reducing function
     *
     * @param {*} f a reducing function
     * @param {*} init
     */
    Iterator.prototype.reduce = function (f, initialValue) {
        var o = this.next();
        var i = 0;
        if (initialValue === undefined && !o.done) {
            initialValue = o.value;
            o = this.next();
            i++;
        }
        while (!o.done) {
            initialValue = f(initialValue, o.value);
            o = this.next();
        }
        return initialValue;
    };
    /**
     * Returns the number of matched items in the sequence
     */
    Iterator.prototype.size = function () {
        return this.reduce(function (acc, _) { return ++acc; }, 0);
    };
    Iterator.prototype[Symbol.iterator] = function () {
        /* eslint-disable @typescript-eslint/no-unsafe-return */
        return this;
    };
    return Iterator;
}());
exports.Iterator = Iterator;


/***/ }),

/***/ 2344:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * Predicates used for Query and Expression operators.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$type = exports.$elemMatch = exports.$size = exports.$all = exports.$exists = exports.$regex = exports.$mod = exports.$gte = exports.$gt = exports.$lte = exports.$lt = exports.$nin = exports.$in = exports.$ne = exports.$eq = exports.createExpressionOperator = exports.createQueryOperator = void 0;
var core_1 = __webpack_require__(7424);
var query_1 = __webpack_require__(7732);
var types_1 = __webpack_require__(1463);
var util_1 = __webpack_require__(6588);
/**
 * Returns a query operator created from the predicate
 *
 * @param predicate Predicate function
 */
function createQueryOperator(predicate) {
    return function (selector, value, options) {
        var opts = { unwrapArray: true };
        var depth = Math.max(1, selector.split(".").length - 1);
        return function (obj) {
            // value of field must be fully resolved.
            var lhs = (0, util_1.resolve)(obj, selector, opts);
            return predicate(lhs, value, __assign(__assign({}, options), { depth: depth }));
        };
    };
}
exports.createQueryOperator = createQueryOperator;
/**
 * Returns an expression operator created from the predicate
 *
 * @param predicate Predicate function
 */
function createExpressionOperator(predicate) {
    return function (obj, expr, options) {
        var args = (0, core_1.computeValue)(obj, expr, null, options);
        return predicate.apply(void 0, args);
    };
}
exports.createExpressionOperator = createExpressionOperator;
/**
 * Checks that two values are equal.
 *
 * @param a         The lhs operand as resolved from the object by the given selector
 * @param b         The rhs operand provided by the user
 * @returns {*}
 */
function $eq(a, b, options) {
    // start with simple equality check
    if ((0, util_1.isEqual)(a, b))
        return true;
    // https://docs.mongodb.com/manual/tutorial/query-for-null-fields/
    if ((0, util_1.isNil)(a) && (0, util_1.isNil)(b))
        return true;
    // check
    if (a instanceof Array) {
        var eq = util_1.isEqual.bind(null, b);
        return a.some(eq) || (0, util_1.flatten)(a, options.depth).some(eq);
    }
    return false;
}
exports.$eq = $eq;
/**
 * Matches all values that are not equal to the value specified in the query.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function $ne(a, b, options) {
    return !$eq(a, b, options);
}
exports.$ne = $ne;
/**
 * Matches any of the values that exist in an array specified in the query.
 *
 * @param a
 * @param b
 * @returns {*}
 */
function $in(a, b, options) {
    // queries for null should be able to find undefined fields
    if ((0, util_1.isNil)(a))
        return b.some(function (v) { return v === null; });
    return (0, util_1.intersection)([(0, util_1.ensureArray)(a), b], options === null || options === void 0 ? void 0 : options.hashFunction).length > 0;
}
exports.$in = $in;
/**
 * Matches values that do not exist in an array specified to the query.
 *
 * @param a
 * @param b
 * @returns {*|boolean}
 */
function $nin(a, b, options) {
    return !$in(a, b, options);
}
exports.$nin = $nin;
/**
 * Matches values that are less than the value specified in the query.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function $lt(a, b, options) {
    return compare(a, b, function (x, y) { return x < y; });
}
exports.$lt = $lt;
/**
 * Matches values that are less than or equal to the value specified in the query.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function $lte(a, b, options) {
    return compare(a, b, function (x, y) { return x <= y; });
}
exports.$lte = $lte;
/**
 * Matches values that are greater than the value specified in the query.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function $gt(a, b, options) {
    return compare(a, b, function (x, y) { return x > y; });
}
exports.$gt = $gt;
/**
 * Matches values that are greater than or equal to the value specified in the query.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function $gte(a, b, options) {
    return compare(a, b, function (x, y) { return x >= y; });
}
exports.$gte = $gte;
/**
 * Performs a modulo operation on the value of a field and selects documents with a specified result.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function $mod(a, b, options) {
    return (0, util_1.ensureArray)(a).some(function (x) { return b.length === 2 && x % b[0] === b[1]; });
}
exports.$mod = $mod;
/**
 * Selects documents where values match a specified regular expression.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function $regex(a, b, options) {
    var lhs = (0, util_1.ensureArray)(a);
    var match = function (x) { return (0, util_1.isString)(x) && !!b.exec(x); };
    return lhs.some(match) || (0, util_1.flatten)(lhs, 1).some(match);
}
exports.$regex = $regex;
/**
 * Matches documents that have the specified field.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function $exists(a, b, options) {
    return (((b === false || b === 0) && a === undefined) ||
        ((b === true || b === 1) && a !== undefined));
}
exports.$exists = $exists;
/**
 * Matches arrays that contain all elements specified in the query.
 *
 * @param values
 * @param queries
 * @returns boolean
 */
function $all(values, queries, options) {
    if (!(0, util_1.isArray)(values) ||
        !(0, util_1.isArray)(queries) ||
        !values.length ||
        !queries.length) {
        return false;
    }
    var matched = true;
    var _loop_1 = function (query) {
        // no need to check all the queries.
        if (!matched)
            return "break";
        if ((0, util_1.isObject)(query) && (0, util_1.inArray)(Object.keys(query), "$elemMatch")) {
            matched = $elemMatch(values, query["$elemMatch"], options);
        }
        else if (query instanceof RegExp) {
            matched = values.some(function (s) { return typeof s === "string" && query.test(s); });
        }
        else {
            matched = values.some(function (v) { return (0, util_1.isEqual)(query, v); });
        }
    };
    for (var _i = 0, queries_1 = queries; _i < queries_1.length; _i++) {
        var query = queries_1[_i];
        var state_1 = _loop_1(query);
        if (state_1 === "break")
            break;
    }
    return matched;
}
exports.$all = $all;
/**
 * Selects documents if the array field is a specified size.
 *
 * @param a
 * @param b
 * @returns {*|boolean}
 */
function $size(a, b, options) {
    return a.length === b;
}
exports.$size = $size;
function isNonBooleanOperator(name) {
    return (0, util_1.isOperator)(name) && ["$and", "$or", "$nor"].indexOf(name) === -1;
}
/**
 * Selects documents if element in the array field matches all the specified $elemMatch condition.
 *
 * @param a {Array} element to match against
 * @param b {Object} subquery
 */
function $elemMatch(a, b, options) {
    // should return false for non-matching input
    if ((0, util_1.isArray)(a) && !(0, util_1.isEmpty)(a)) {
        var format = function (x) { return x; };
        var criteria = b;
        // If we find a boolean operator in the subquery, we fake a field to point to it. This is an
        // attempt to ensure that it is a valid criteria. We cannot make this substitution for operators
        // like $and/$or/$nor; as otherwise, this faking will break our query.
        if (Object.keys(b).every(isNonBooleanOperator)) {
            criteria = { temp: b };
            format = function (x) { return ({ temp: x }); };
        }
        var query = new query_1.Query(criteria, options);
        for (var i = 0, len = a.length; i < len; i++) {
            if (query.test(format(a[i]))) {
                return true;
            }
        }
    }
    return false;
}
exports.$elemMatch = $elemMatch;
/**
 * Selects documents if a field is of the specified type.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function compareType(a, b, options) {
    switch (b) {
        case 1:
        case 19:
        case types_1.BsonType.DOUBLE:
        case types_1.BsonType.DECIMAL:
            return (0, util_1.isNumber)(a);
        case 2:
        case types_1.JsType.STRING:
            return (0, util_1.isString)(a);
        case 3:
        case types_1.JsType.OBJECT:
            return (0, util_1.isObject)(a);
        case 4:
        case types_1.JsType.ARRAY:
            return (0, util_1.isArray)(a);
        case 6:
        case types_1.JsType.UNDEFINED:
            return (0, util_1.isNil)(a);
        case 8:
        case types_1.JsType.BOOLEAN:
        case types_1.BsonType.BOOL:
            return (0, util_1.isBoolean)(a);
        case 9:
        case types_1.JsType.DATE:
            return (0, util_1.isDate)(a);
        case 10:
        case types_1.JsType.NULL:
            return a === null;
        case 11:
        case types_1.JsType.REGEXP:
        case types_1.BsonType.REGEX:
            return (0, util_1.isRegExp)(a);
        case 16:
        case types_1.BsonType.INT:
            return ((0, util_1.isNumber)(a) &&
                a >= util_1.MIN_INT &&
                a <= util_1.MAX_INT &&
                a.toString().indexOf(".") === -1);
        case 18:
        case types_1.BsonType.LONG:
            return ((0, util_1.isNumber)(a) &&
                a >= util_1.MIN_LONG &&
                a <= util_1.MAX_LONG &&
                a.toString().indexOf(".") === -1);
        default:
            return false;
    }
}
/**
 * Selects documents if a field is of the specified type.
 *
 * @param a
 * @param b
 * @returns {boolean}
 */
function $type(a, b, options) {
    return Array.isArray(b)
        ? b.findIndex(function (t) { return compareType(a, t, options); }) >= 0
        : compareType(a, b, options);
}
exports.$type = $type;
function compare(a, b, f) {
    return (0, util_1.ensureArray)(a).some(function (x) { return (0, util_1.getType)(x) === (0, util_1.getType)(b) && f(x, b); });
}


/***/ }),

/***/ 989:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.covariance = exports.stddev = void 0;
/**
 * Compute the standard deviation of the data set
 * @param {Array} array of numbers
 * @param {Boolean} if true calculates a sample standard deviation, otherwise calculates a population stddev
 * @return {Number}
 */
function stddev(data, sampled) {
    if (sampled === void 0) { sampled = true; }
    var sum = data.reduce(function (acc, n) { return acc + n; }, 0);
    var N = data.length || 1;
    var avg = sum / N;
    return Math.sqrt(data.reduce(function (acc, n) { return acc + Math.pow(n - avg, 2); }, 0) /
        (N - Number(sampled)));
}
exports.stddev = stddev;
function covariance(dataset, sampled) {
    if (sampled === void 0) { sampled = true; }
    if (!dataset)
        return null;
    if (dataset.length < 2)
        return sampled ? null : 0;
    var meanX = 0.0;
    var meanY = 0.0;
    for (var _i = 0, dataset_1 = dataset; _i < dataset_1.length; _i++) {
        var _a = dataset_1[_i], x = _a[0], y = _a[1];
        meanX += x;
        meanY += y;
    }
    meanX /= dataset.length;
    meanY /= dataset.length;
    var result = 0;
    for (var _b = 0, dataset_2 = dataset; _b < dataset_2.length; _b++) {
        var _c = dataset_2[_b], x = _c[0], y = _c[1];
        result += (x - meanX) * (y - meanY);
    }
    return result / (dataset.length - Number(sampled));
}
exports.covariance = covariance;


/***/ }),

/***/ 4326:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$addToSet = void 0;
var util_1 = __webpack_require__(6588);
var push_1 = __webpack_require__(9510);
/**
 * Returns an array of all the unique values for the selected field among for each document in that group.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @param {Options} options The options to use for this operation
 * @returns {*}
 */
function $addToSet(collection, expr, options) {
    return (0, util_1.unique)((0, push_1.$push)(collection, expr, options), options === null || options === void 0 ? void 0 : options.hashFunction);
}
exports.$addToSet = $addToSet;


/***/ }),

/***/ 1148:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$avg = void 0;
var util_1 = __webpack_require__(6588);
var push_1 = __webpack_require__(9510);
/**
 * Returns an average of all the values in a group.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @param {Options} options The options to use for this operation
 * @returns {Number}
 */
function $avg(collection, expr, options) {
    var data = (0, push_1.$push)(collection, expr, options).filter(util_1.isNumber);
    var sum = data.reduce(function (acc, n) { return acc + n; }, 0);
    return sum / (data.length || 1);
}
exports.$avg = $avg;


/***/ }),

/***/ 4487:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$count = void 0;
/**
 * Returns the number of documents in the group or window.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @returns {*}
 */
function $count(collection, expr, options) {
    return collection.length;
}
exports.$count = $count;


/***/ }),

/***/ 104:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$covariancePop = void 0;
var _internal_1 = __webpack_require__(989);
var push_1 = __webpack_require__(9510);
/**
 * Returns the population covariance of two numeric expressions.
 * @param  {Array} collection
 * @param  {Object} expr
 * @return {Number|null}
 */
function $covariancePop(collection, expr, options) {
    return (0, _internal_1.covariance)((0, push_1.$push)(collection, expr, options), false);
}
exports.$covariancePop = $covariancePop;


/***/ }),

/***/ 4863:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$covarianceSamp = void 0;
var _internal_1 = __webpack_require__(989);
var push_1 = __webpack_require__(9510);
/**
 * Returns the sample covariance of two numeric expressions.
 * @param  {Array} collection
 * @param  {Object} expr
 * @return {Number|null}
 */
function $covarianceSamp(collection, expr, options) {
    return (0, _internal_1.covariance)((0, push_1.$push)(collection, expr, options), true);
}
exports.$covarianceSamp = $covarianceSamp;


/***/ }),

/***/ 8786:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$first = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Returns the first value in a group.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @returns {*}
 */
function $first(collection, expr, options) {
    return collection.length > 0
        ? (0, core_1.computeValue)(collection[0], expr, null, options)
        : undefined;
}
exports.$first = $first;


/***/ }),

/***/ 1998:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * Group stage Accumulator Operators. https://docs.mongodb.com/manual/reference/operator/aggregation-
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(4326), exports);
__exportStar(__webpack_require__(1148), exports);
__exportStar(__webpack_require__(4487), exports);
__exportStar(__webpack_require__(104), exports);
__exportStar(__webpack_require__(4863), exports);
__exportStar(__webpack_require__(8786), exports);
__exportStar(__webpack_require__(8126), exports);
__exportStar(__webpack_require__(209), exports);
__exportStar(__webpack_require__(2879), exports);
__exportStar(__webpack_require__(1702), exports);
__exportStar(__webpack_require__(9510), exports);
__exportStar(__webpack_require__(6672), exports);
__exportStar(__webpack_require__(6094), exports);
__exportStar(__webpack_require__(6988), exports);


/***/ }),

/***/ 8126:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$last = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Returns the last value in the collection.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @param {Options} options The options to use for this operation
 * @returns {*}
 */
function $last(collection, expr, options) {
    return collection.length > 0
        ? (0, core_1.computeValue)(collection[collection.length - 1], expr, null, options)
        : undefined;
}
exports.$last = $last;


/***/ }),

/***/ 209:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$max = void 0;
var push_1 = __webpack_require__(9510);
/**
 * Returns the highest value in a group.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @param {Options} options The options to use for this operation
 * @returns {*}
 */
function $max(collection, expr, options) {
    var nums = (0, push_1.$push)(collection, expr, options);
    var n = nums.reduce(function (acc, n) { return (n > acc ? n : acc); }, -Infinity);
    return n === -Infinity ? undefined : n;
}
exports.$max = $max;


/***/ }),

/***/ 2879:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$mergeObjects = void 0;
var mergeObjects_1 = __webpack_require__(934);
/**
 * Combines multiple documents into a single document.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @param {Options} options The options to use for this operation
 * @returns {Array|*}
 */
exports.$mergeObjects = mergeObjects_1.$mergeObjects;


/***/ }),

/***/ 1702:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$min = void 0;
var push_1 = __webpack_require__(9510);
/**
 * Returns the lowest value in a group.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @param {Options} The options to use for this operator
 * @returns {*}
 */
function $min(collection, expr, options) {
    var nums = (0, push_1.$push)(collection, expr, options);
    var n = nums.reduce(function (acc, n) { return (n < acc ? n : acc); }, Infinity);
    return n === Infinity ? undefined : n;
}
exports.$min = $min;


/***/ }),

/***/ 9510:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$push = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns an array of all values for the selected field among for each document in that group.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @param {Options} options The options to use for this operation
 * @returns {Array|*}
 */
function $push(collection, expr, options) {
    if ((0, util_1.isNil)(expr))
        return collection;
    return collection.map(function (obj) { return (0, core_1.computeValue)(obj, expr, null, options); });
}
exports.$push = $push;


/***/ }),

/***/ 6672:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$stdDevPop = void 0;
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(989);
var push_1 = __webpack_require__(9510);
/**
 * Returns the population standard deviation of the input values.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @param {Options} options The options to use for this operation
 * @return {Number}
 */
function $stdDevPop(collection, expr, options) {
    return (0, _internal_1.stddev)((0, push_1.$push)(collection, expr, options).filter(util_1.isNumber), false);
}
exports.$stdDevPop = $stdDevPop;


/***/ }),

/***/ 6094:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$stdDevSamp = void 0;
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(989);
var push_1 = __webpack_require__(9510);
/**
 * Returns the sample standard deviation of the input values.
 * @param  {Array} collection
 * @param  {Object} expr
 * @return {Number|null}
 */
function $stdDevSamp(collection, expr, options) {
    return (0, _internal_1.stddev)((0, push_1.$push)(collection, expr, options).filter(util_1.isNumber), true);
}
exports.$stdDevSamp = $stdDevSamp;


/***/ }),

/***/ 6988:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$sum = void 0;
var util_1 = __webpack_require__(6588);
var push_1 = __webpack_require__(9510);
/**
 * Returns the sum of all the values in a group.
 *
 * @param {Array} collection The input array
 * @param {Object} expr The right-hand side expression value of the operator
 * @returns {Number}
 */
function $sum(collection, expr, options) {
    if (!(0, util_1.isArray)(collection))
        return 0;
    // take a short cut if expr is number literal
    if ((0, util_1.isNumber)(expr))
        return collection.length * expr;
    var nums = (0, push_1.$push)(collection, expr, options).filter(util_1.isNumber);
    return nums.reduce(function (acc, n) { return acc + n; }, 0);
}
exports.$sum = $sum;


/***/ }),

/***/ 612:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.truncate = void 0;
/**
 * Truncates integer value to number of places. If roundOff is specified round value instead to the number of places
 * @param {Number} num
 * @param {Number} places
 * @param {Boolean} roundOff
 */
function truncate(num, places, roundOff) {
    var sign = Math.abs(num) === num ? 1 : -1;
    num = Math.abs(num);
    var result = Math.trunc(num);
    var decimals = num - result;
    if (places === 0) {
        var firstDigit = Math.trunc(10 * decimals);
        if (roundOff && (result & 1) === 1 && firstDigit >= 5) {
            result++;
        }
    }
    else if (places > 0) {
        var offset = Math.pow(10, places);
        var remainder = Math.trunc(decimals * offset);
        // last digit before cut off
        var lastDigit = Math.trunc(decimals * offset * 10) % 10;
        // add one if last digit is greater than 5
        if (roundOff && lastDigit > 5) {
            remainder += 1;
        }
        // compute decimal remainder and add to whole number
        result += remainder / offset;
    }
    else if (places < 0) {
        // handle negative decimal places
        var offset = Math.pow(10, -1 * places);
        var excess = result % offset;
        result = Math.max(0, result - excess);
        // for negative values the absolute must increase so we round up the last digit if >= 5
        if (roundOff && sign === -1) {
            while (excess > 10) {
                excess -= excess % 10;
            }
            if (result > 0 && excess >= 5) {
                result += offset;
            }
        }
    }
    return result * sign;
}
exports.truncate = truncate;


/***/ }),

/***/ 7824:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$abs = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns the absolute value of a number.
 *
 * @param obj
 * @param expr
 * @return {Number|null|NaN}
 */
function $abs(obj, expr, options) {
    var n = (0, core_1.computeValue)(obj, expr, null, options);
    return (0, util_1.isNil)(n) ? null : Math.abs(n);
}
exports.$abs = $abs;


/***/ }),

/***/ 8631:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$add = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Computes the sum of an array of numbers.
 *
 * @param obj
 * @param expr
 * @returns {Object}
 */
function $add(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var foundDate = false;
    var result = args.reduce(function (acc, val) {
        if ((0, util_1.isDate)(val)) {
            (0, util_1.assert)(!foundDate, "'$add' can only have one date value");
            foundDate = true;
            val = val.getTime();
        }
        // assume val is a number
        acc += val;
        return acc;
    }, 0);
    return foundDate ? new Date(result) : result;
}
exports.$add = $add;


/***/ }),

/***/ 7296:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$ceil = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns the smallest integer greater than or equal to the specified number.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $ceil(obj, expr, options) {
    var n = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(n))
        return null;
    (0, util_1.assert)((0, util_1.isNumber)(n) || isNaN(n), "$ceil expression must resolve to a number.");
    return Math.ceil(n);
}
exports.$ceil = $ceil;


/***/ }),

/***/ 193:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$divide = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Takes two numbers and divides the first number by the second.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $divide(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    return args[0] / args[1];
}
exports.$divide = $divide;


/***/ }),

/***/ 2960:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$exp = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Raises Euler’s number (i.e. e ) to the specified exponent and returns the result.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $exp(obj, expr, options) {
    var n = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(n))
        return null;
    (0, util_1.assert)((0, util_1.isNumber)(n) || isNaN(n), "$exp expression must resolve to a number.");
    return Math.exp(n);
}
exports.$exp = $exp;


/***/ }),

/***/ 4365:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$floor = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns the largest integer less than or equal to the specified number.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $floor(obj, expr, options) {
    var n = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(n))
        return null;
    (0, util_1.assert)((0, util_1.isNumber)(n) || isNaN(n), "$floor expression must resolve to a number.");
    return Math.floor(n);
}
exports.$floor = $floor;


/***/ }),

/***/ 6665:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(7824), exports);
__exportStar(__webpack_require__(8631), exports);
__exportStar(__webpack_require__(7296), exports);
__exportStar(__webpack_require__(193), exports);
__exportStar(__webpack_require__(2960), exports);
__exportStar(__webpack_require__(4365), exports);
__exportStar(__webpack_require__(7328), exports);
__exportStar(__webpack_require__(1623), exports);
__exportStar(__webpack_require__(1455), exports);
__exportStar(__webpack_require__(707), exports);
__exportStar(__webpack_require__(9332), exports);
__exportStar(__webpack_require__(9430), exports);
__exportStar(__webpack_require__(7817), exports);
__exportStar(__webpack_require__(3341), exports);
__exportStar(__webpack_require__(7951), exports);
__exportStar(__webpack_require__(8973), exports);


/***/ }),

/***/ 7328:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$ln = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Calculates the natural logarithm ln (i.e loge) of a number and returns the result as a double.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $ln(obj, expr, options) {
    var n = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(n))
        return null;
    (0, util_1.assert)((0, util_1.isNumber)(n) || isNaN(n), "$ln expression must resolve to a number.");
    return Math.log(n);
}
exports.$ln = $ln;


/***/ }),

/***/ 1623:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$log = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Calculates the log of a number in the specified base and returns the result as a double.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $log(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var msg = "$log expression must resolve to array(2) of numbers";
    (0, util_1.assert)((0, util_1.isArray)(args) && args.length === 2, msg);
    if (args.some(util_1.isNil))
        return null;
    (0, util_1.assert)(args.some(isNaN) || args.every(util_1.isNumber), msg);
    return Math.log10(args[0]) / Math.log10(args[1]);
}
exports.$log = $log;


/***/ }),

/***/ 1455:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$log10 = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Calculates the log base 10 of a number and returns the result as a double.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $log10(obj, expr, options) {
    var n = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(n))
        return null;
    (0, util_1.assert)((0, util_1.isNumber)(n) || isNaN(n), "$log10 expression must resolve to a number.");
    return Math.log10(n);
}
exports.$log10 = $log10;


/***/ }),

/***/ 707:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$mod = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Takes two numbers and calculates the modulo of the first number divided by the second.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $mod(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    return args[0] % args[1];
}
exports.$mod = $mod;


/***/ }),

/***/ 9332:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$multiply = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Computes the product of an array of numbers.
 *
 * @param obj
 * @param expr
 * @returns {Object}
 */
function $multiply(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    return args.reduce(function (acc, num) { return acc * num; }, 1);
}
exports.$multiply = $multiply;


/***/ }),

/***/ 9430:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$pow = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Raises a number to the specified exponent and returns the result.
 *
 * @param obj
 * @param expr
 * @returns {Object}
 */
function $pow(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    (0, util_1.assert)((0, util_1.isArray)(args) && args.length === 2 && args.every(util_1.isNumber), "$pow expression must resolve to array(2) of numbers");
    (0, util_1.assert)(!(args[0] === 0 && args[1] < 0), "$pow cannot raise 0 to a negative exponent");
    return Math.pow(args[0], args[1]);
}
exports.$pow = $pow;


/***/ }),

/***/ 7817:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$round = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(612);
/**
 * Rounds a number to to a whole integer or to a specified decimal place.
 * @param {*} obj
 * @param {*} expr
 */
function $round(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var num = args[0];
    var place = args[1];
    if ((0, util_1.isNil)(num) || isNaN(num) || Math.abs(num) === Infinity)
        return num;
    (0, util_1.assert)((0, util_1.isNumber)(num), "$round expression must resolve to a number.");
    return (0, _internal_1.truncate)(num, place, true);
}
exports.$round = $round;


/***/ }),

/***/ 3341:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$sqrt = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Calculates the square root of a positive number and returns the result as a double.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $sqrt(obj, expr, options) {
    var n = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(n))
        return null;
    (0, util_1.assert)(((0, util_1.isNumber)(n) && n > 0) || isNaN(n), "$sqrt expression must resolve to non-negative number.");
    return Math.sqrt(n);
}
exports.$sqrt = $sqrt;


/***/ }),

/***/ 7951:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$subtract = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Takes an array that contains two numbers or two dates and subtracts the second value from the first.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $subtract(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    return args[0] - args[1];
}
exports.$subtract = $subtract;


/***/ }),

/***/ 8973:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Arithmetic Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#arithmetic-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$trunc = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(612);
/**
 * Truncates a number to a whole integer or to a specified decimal place.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $trunc(obj, expr, options) {
    var arr = (0, core_1.computeValue)(obj, expr, null, options);
    var num = arr[0];
    var places = arr[1];
    if ((0, util_1.isNil)(num) || isNaN(num) || Math.abs(num) === Infinity)
        return num;
    (0, util_1.assert)((0, util_1.isNumber)(num), "$trunc expression must resolve to a number.");
    (0, util_1.assert)((0, util_1.isNil)(places) || ((0, util_1.isNumber)(places) && places > -20 && places < 100), "$trunc expression has invalid place");
    return (0, _internal_1.truncate)(num, places, false);
}
exports.$trunc = $trunc;


/***/ }),

/***/ 1194:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$arrayElemAt = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns the element at the specified array index.
 *
 * @param  {Object} obj
 * @param  {*} expr
 * @return {*}
 */
function $arrayElemAt(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    (0, util_1.assert)(args instanceof Array && args.length === 2, "$arrayElemAt expression must resolve to array(2)");
    if (args.some(util_1.isNil))
        return null;
    var index = args[1];
    var arr = args[0];
    if (index < 0 && Math.abs(index) <= arr.length) {
        return arr[(index + arr.length) % arr.length];
    }
    else if (index >= 0 && index < arr.length) {
        return arr[index];
    }
    return undefined;
}
exports.$arrayElemAt = $arrayElemAt;


/***/ }),

/***/ 2212:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$arrayToObject = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Converts an array of key value pairs to a document.
 */
function $arrayToObject(obj, expr, options) {
    var arr = (0, core_1.computeValue)(obj, expr, null, options);
    (0, util_1.assert)((0, util_1.isArray)(arr), "$arrayToObject expression must resolve to an array");
    return arr.reduce(function (newObj, val) {
        if (val instanceof Array && val.length == 2) {
            newObj[val[0]] = val[1];
        }
        else {
            var valObj = val;
            (0, util_1.assert)((0, util_1.isObject)(valObj) && (0, util_1.has)(valObj, "k") && (0, util_1.has)(valObj, "v"), "$arrayToObject expression is invalid.");
            newObj[valObj.k] = valObj.v;
        }
        return newObj;
    }, {});
}
exports.$arrayToObject = $arrayToObject;


/***/ }),

/***/ 7356:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$concatArrays = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Concatenates arrays to return the concatenated array.
 *
 * @param  {Object} obj
 * @param  {*} expr
 * @return {*}
 */
function $concatArrays(obj, expr, options) {
    var arr = (0, core_1.computeValue)(obj, expr, null, options);
    (0, util_1.assert)((0, util_1.isArray)(arr), "$concatArrays must resolve to an array");
    if (arr.some(util_1.isNil))
        return null;
    return arr.reduce(function (acc, item) { return (0, util_1.into)(acc, item); }, []);
}
exports.$concatArrays = $concatArrays;


/***/ }),

/***/ 5220:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$filter = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Selects a subset of the array to return an array with only the elements that match the filter condition.
 *
 * @param  {Object} obj  [description]
 * @param  {*} expr [description]
 * @return {*}      [description]
 */
function $filter(obj, expr, options) {
    var input = (0, core_1.computeValue)(obj, expr.input, null, options);
    (0, util_1.assert)((0, util_1.isArray)(input), "$filter 'input' expression must resolve to an array");
    var tempKey = "$" + (expr.as || "this");
    return input.filter(function (o) {
        var _a;
        return (0, core_1.computeValue)(__assign(__assign({}, obj), (_a = {}, _a[tempKey] = o, _a)), expr.cond, null, options) === true;
    });
}
exports.$filter = $filter;


/***/ }),

/***/ 6454:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$first = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns the first element in an array.
 *
 * @param  {Object} obj
 * @param  {*} expr
 * @return {*}
 */
function $first(obj, expr, options) {
    var arr = (0, core_1.computeValue)(obj, expr, null, options);
    if (arr == null)
        return null;
    (0, util_1.assert)((0, util_1.isArray)(arr), "Must resolve to an array/null or missing");
    if (arr.length > 0)
        return arr[0];
    return undefined;
}
exports.$first = $first;


/***/ }),

/***/ 1706:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$in = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns a boolean indicating whether a specified value is in an array.
 *
 * @param {Object} obj
 * @param {Array} expr
 */
function $in(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var item = args[0];
    var arr = args[1];
    (0, util_1.assert)((0, util_1.isArray)(arr), "$in second argument must be an array");
    return arr.some(util_1.isEqual.bind(null, item));
}
exports.$in = $in;


/***/ }),

/***/ 3142:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(1194), exports);
__exportStar(__webpack_require__(2212), exports);
__exportStar(__webpack_require__(7356), exports);
__exportStar(__webpack_require__(5220), exports);
__exportStar(__webpack_require__(6454), exports);
__exportStar(__webpack_require__(1706), exports);
__exportStar(__webpack_require__(2220), exports);
__exportStar(__webpack_require__(4479), exports);
__exportStar(__webpack_require__(5130), exports);
__exportStar(__webpack_require__(8561), exports);
__exportStar(__webpack_require__(5538), exports);
__exportStar(__webpack_require__(2941), exports);
__exportStar(__webpack_require__(8274), exports);
__exportStar(__webpack_require__(4547), exports);
__exportStar(__webpack_require__(4967), exports);
__exportStar(__webpack_require__(78), exports);
__exportStar(__webpack_require__(2305), exports);


/***/ }),

/***/ 2220:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$indexOfArray = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Searches an array for an occurrence of a specified value and returns the array index of the first occurrence.
 * If the substring is not found, returns -1.
 *
 * @param  {Object} obj
 * @param  {*} expr
 * @return {*}
 */
function $indexOfArray(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(args))
        return null;
    var arr = args[0];
    var searchValue = args[1];
    if ((0, util_1.isNil)(arr))
        return null;
    (0, util_1.assert)((0, util_1.isArray)(arr), "$indexOfArray expression must resolve to an array.");
    var start = args[2] || 0;
    var end = args[3];
    if ((0, util_1.isNil)(end))
        end = arr.length;
    if (start > end)
        return -1;
    (0, util_1.assert)(start >= 0 && end >= 0, "$indexOfArray expression is invalid");
    if (start > 0 || end < arr.length) {
        arr = arr.slice(start, end);
    }
    // Array.prototype.findIndex not supported in IE9 hence this workaround
    var index = -1;
    arr.some(function (v, i) {
        var b = (0, util_1.isEqual)(v, searchValue);
        if (b)
            index = i;
        return b;
    });
    return index + start;
}
exports.$indexOfArray = $indexOfArray;


/***/ }),

/***/ 4479:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$isArray = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Determines if the operand is an array. Returns a boolean.
 *
 * @param  {Object}  obj
 * @param  {*}  expr
 * @return {Boolean}
 */
function $isArray(obj, expr, options) {
    return (0, core_1.computeValue)(obj, expr[0], null, options) instanceof Array;
}
exports.$isArray = $isArray;


/***/ }),

/***/ 5130:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$last = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns the last element in an array.
 *
 * @param  {Object} obj
 * @param  {*} expr
 * @return {*}
 */
function $last(obj, expr, options) {
    var arr = (0, core_1.computeValue)(obj, expr, null, options);
    if (arr == null)
        return null;
    (0, util_1.assert)((0, util_1.isArray)(arr), "Must resolve to an array/null or missing");
    if (arr.length > 0)
        return arr[arr.length - 1];
    return undefined;
}
exports.$last = $last;


/***/ }),

/***/ 8561:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$map = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Applies a sub-expression to each element of an array and returns the array of resulting values in order.
 *
 * @param obj
 * @param expr
 * @returns {Array|*}
 */
function $map(obj, expr, options) {
    var input = (0, core_1.computeValue)(obj, expr.input, null, options);
    (0, util_1.assert)((0, util_1.isArray)(input), "$map 'input' expression must resolve to an array");
    var tempKey = "$" + (expr.as || "this");
    return input.map(function (o) {
        var _a;
        return (0, core_1.computeValue)(__assign(__assign({}, obj), (_a = {}, _a[tempKey] = o, _a)), expr.in, null, options);
    });
}
exports.$map = $map;


/***/ }),

/***/ 5538:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$nin = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Returns a boolean indicating whether a specified value is not an array.
 * Note: This expression operator is missing from the documentation
 *
 * @param {Object} obj
 * @param {Array} expr
 */
exports.$nin = (0, _predicates_1.createExpressionOperator)(_predicates_1.$nin);


/***/ }),

/***/ 2941:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$range = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Returns an array whose elements are a generated sequence of numbers.
 *
 * @param  {Object} obj
 * @param  {*} expr
 * @return {*}
 */
function $range(obj, expr, options) {
    var arr = (0, core_1.computeValue)(obj, expr, null, options);
    var start = arr[0];
    var end = arr[1];
    var step = arr[2] || 1;
    var result = new Array();
    var counter = start;
    while ((counter < end && step > 0) || (counter > end && step < 0)) {
        result.push(counter);
        counter += step;
    }
    return result;
}
exports.$range = $range;


/***/ }),

/***/ 8274:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$reduce = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Applies an expression to each element in an array and combines them into a single value.
 *
 * @param {Object} obj
 * @param {*} expr
 */
function $reduce(obj, expr, options) {
    var input = (0, core_1.computeValue)(obj, expr.input, null, options);
    var initialValue = (0, core_1.computeValue)(obj, expr.initialValue, null, options);
    var inExpr = expr["in"];
    if ((0, util_1.isNil)(input))
        return null;
    (0, util_1.assert)((0, util_1.isArray)(input), "$reduce 'input' expression must resolve to an array");
    return input.reduce(function (acc, n) { return (0, core_1.computeValue)({ $value: acc, $this: n }, inExpr, null, options); }, initialValue);
}
exports.$reduce = $reduce;


/***/ }),

/***/ 4547:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$reverseArray = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns an array with the elements in reverse order.
 *
 * @param  {Object} obj
 * @param  {*} expr
 * @return {*}
 */
function $reverseArray(obj, expr, options) {
    var arr = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(arr))
        return null;
    (0, util_1.assert)((0, util_1.isArray)(arr), "$reverseArray expression must resolve to an array");
    var result = [];
    (0, util_1.into)(result, arr);
    result.reverse();
    return result;
}
exports.$reverseArray = $reverseArray;


/***/ }),

/***/ 4967:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$size = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Counts and returns the total the number of items in an array.
 *
 * @param obj
 * @param expr
 */
function $size(obj, expr, options) {
    var value = (0, core_1.computeValue)(obj, expr, null, options);
    return (0, util_1.isArray)(value) ? value.length : undefined;
}
exports.$size = $size;


/***/ }),

/***/ 78:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$slice = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns a subset of an array.
 *
 * @param  {Object} obj
 * @param  {*} expr
 * @return {*}
 */
function $slice(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var arr = args[0];
    var skip = args[1];
    var limit = args[2];
    // MongoDB $slice works a bit differently from Array.slice
    // Uses single argument for 'limit' and array argument [skip, limit]
    if ((0, util_1.isNil)(limit)) {
        if (skip < 0) {
            skip = Math.max(0, arr.length + skip);
            limit = arr.length - skip + 1;
        }
        else {
            limit = skip;
            skip = 0;
        }
    }
    else {
        if (skip < 0) {
            skip = Math.max(0, arr.length + skip);
        }
        (0, util_1.assert)(limit > 0, "Invalid argument for $slice operator. Limit must be a positive number");
        limit += skip;
    }
    return arr.slice(skip, limit);
}
exports.$slice = $slice;


/***/ }),

/***/ 2305:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Array Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#array-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$zip = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Merge two lists together.
 *
 * Transposes an array of input arrays so that the first element of the output array would be an array containing,
 * the first element of the first input array, the first element of the second input array, etc.
 *
 * @param  {Obj} obj
 * @param  {*} expr
 * @return {*}
 */
function $zip(obj, expr, options) {
    var inputs = (0, core_1.computeValue)(obj, expr.inputs, null, options);
    var useLongestLength = expr.useLongestLength || false;
    (0, util_1.assert)((0, util_1.isArray)(inputs), "'inputs' expression must resolve to an array");
    (0, util_1.assert)((0, util_1.isBoolean)(useLongestLength), "'useLongestLength' must be a boolean");
    if ((0, util_1.isArray)(expr.defaults)) {
        (0, util_1.assert)((0, util_1.truthy)(useLongestLength), "'useLongestLength' must be set to true to use 'defaults'");
    }
    var zipCount = 0;
    for (var i = 0, len = inputs.length; i < len; i++) {
        var arr = inputs[i];
        if ((0, util_1.isNil)(arr))
            return null;
        (0, util_1.assert)((0, util_1.isArray)(arr), "'inputs' expression values must resolve to an array or null");
        zipCount = useLongestLength
            ? Math.max(zipCount, arr.length)
            : Math.min(zipCount || arr.length, arr.length);
    }
    var result = [];
    var defaults = expr.defaults || [];
    var _loop_1 = function (i) {
        var temp = inputs.map(function (val, index) {
            return (0, util_1.isNil)(val[i]) ? defaults[index] || null : val[i];
        });
        result.push(temp);
    };
    for (var i = 0; i < zipCount; i++) {
        _loop_1(i);
    }
    return result;
}
exports.$zip = $zip;


/***/ }),

/***/ 510:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Boolean Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#boolean-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$and = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns true only when all its expressions evaluate to true. Accepts any number of argument expressions.
 *
 * @param obj
 * @param expr
 * @returns {boolean}
 */
function $and(obj, expr, options) {
    var value = (0, core_1.computeValue)(obj, expr, null, options);
    return (0, util_1.truthy)(value) && value.every(util_1.truthy);
}
exports.$and = $and;


/***/ }),

/***/ 5039:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(510), exports);
__exportStar(__webpack_require__(7846), exports);
__exportStar(__webpack_require__(7405), exports);


/***/ }),

/***/ 7846:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Boolean Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#boolean-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$not = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns the boolean value that is the opposite of its argument expression. Accepts a single argument expression.
 *
 * @param obj RawObject from collection
 * @param expr Right hand side expression of operator
 * @returns {boolean}
 */
function $not(obj, expr, options) {
    var booleanExpr = (0, util_1.ensureArray)(expr);
    // array values are truthy so an emty array is false
    if (booleanExpr.length == 0)
        return false;
    // use provided value non-array value
    if (booleanExpr.length == 1)
        return !(0, core_1.computeValue)(obj, booleanExpr[0], null, options);
    // expects a single argument
    throw "Expression $not takes exactly 1 argument";
}
exports.$not = $not;


/***/ }),

/***/ 7405:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Boolean Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#boolean-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$or = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns true when any of its expressions evaluates to true. Accepts any number of argument expressions.
 *
 * @param obj
 * @param expr
 * @returns {boolean}
 */
function $or(obj, expr, options) {
    var value = (0, core_1.computeValue)(obj, expr, null, options);
    return (0, util_1.truthy)(value) && value.some(util_1.truthy);
}
exports.$or = $or;


/***/ }),

/***/ 3802:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Comparison Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#comparison-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$cmp = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Compares two values and returns the result of the comparison as an integer.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $cmp(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    if (args[0] > args[1])
        return 1;
    if (args[0] < args[1])
        return -1;
    return 0;
}
exports.$cmp = $cmp;


/***/ }),

/***/ 7657:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Comparison Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#comparison-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$eq = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches values that are equal to a specified value.
 */
exports.$eq = (0, _predicates_1.createExpressionOperator)(_predicates_1.$eq);


/***/ }),

/***/ 4359:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Comparison Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#comparison-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$gt = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches values that are greater than a specified value.
 */
exports.$gt = (0, _predicates_1.createExpressionOperator)(_predicates_1.$gt);


/***/ }),

/***/ 5948:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Comparison Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#comparison-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$gte = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * 	Matches values that are greater than or equal to a specified value.
 */
exports.$gte = (0, _predicates_1.createExpressionOperator)(_predicates_1.$gte);


/***/ }),

/***/ 6312:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(3802), exports);
__exportStar(__webpack_require__(7657), exports);
__exportStar(__webpack_require__(4359), exports);
__exportStar(__webpack_require__(5948), exports);
__exportStar(__webpack_require__(2618), exports);
__exportStar(__webpack_require__(7160), exports);
__exportStar(__webpack_require__(2850), exports);


/***/ }),

/***/ 2618:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Comparison Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#comparison-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$lt = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches values that are less than the value specified in the query.
 */
exports.$lt = (0, _predicates_1.createExpressionOperator)(_predicates_1.$lt);


/***/ }),

/***/ 7160:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Comparison Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#comparison-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$lte = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches values that are less than or equal to the value specified in the query.
 */
exports.$lte = (0, _predicates_1.createExpressionOperator)(_predicates_1.$lte);


/***/ }),

/***/ 2850:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Comparison Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#comparison-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$ne = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches all values that are not equal to the value specified in the query.
 */
exports.$ne = (0, _predicates_1.createExpressionOperator)(_predicates_1.$ne);


/***/ }),

/***/ 6379:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Conditional Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#conditional-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$cond = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * A ternary operator that evaluates one expression,
 * and depending on the result returns the value of one following expressions.
 *
 * @param obj
 * @param expr
 */
function $cond(obj, expr, options) {
    var ifExpr;
    var thenExpr;
    var elseExpr;
    var errorMsg = "$cond: invalid arguments";
    if (expr instanceof Array) {
        (0, util_1.assert)(expr.length === 3, errorMsg);
        ifExpr = expr[0];
        thenExpr = expr[1];
        elseExpr = expr[2];
    }
    else {
        (0, util_1.assert)((0, util_1.isObject)(expr), errorMsg);
        ifExpr = expr.if;
        thenExpr = expr.then;
        elseExpr = expr.else;
    }
    var condition = (0, core_1.computeValue)(obj, ifExpr, null, options);
    return (0, core_1.computeValue)(obj, condition ? thenExpr : elseExpr, null, options);
}
exports.$cond = $cond;


/***/ }),

/***/ 3216:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Conditional Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#conditional-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$ifNull = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Evaluates an expression and returns the first expression if it evaluates to a non-null value.
 * Otherwise, $ifNull returns the second expression's value.
 *
 * @param obj
 * @param expr
 * @returns {*}
 */
function $ifNull(obj, expr, options) {
    (0, util_1.assert)((0, util_1.isArray)(expr) && expr.length === 2, "$ifNull expression must resolve to array(2)");
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    return (0, util_1.isNil)(args[0]) ? args[1] : args[0];
}
exports.$ifNull = $ifNull;


/***/ }),

/***/ 5528:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(6379), exports);
__exportStar(__webpack_require__(3216), exports);
__exportStar(__webpack_require__(8499), exports);


/***/ }),

/***/ 8499:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Conditional Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#conditional-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$switch = void 0;
var core_1 = __webpack_require__(7424);
/**
 * An operator that evaluates a series of case expressions. When it finds an expression which
 * evaluates to true, it returns the resulting expression for that case. If none of the cases
 * evaluate to true, it returns the default expression.
 *
 * @param obj
 * @param expr
 */
function $switch(obj, expr, options) {
    var thenExpr = null;
    // Array.prototype.find not supported in IE, hence the '.some()' proxy
    expr.branches.some(function (b) {
        var found = (0, core_1.computeValue)(obj, b.case, null, options);
        if (found === true)
            thenExpr = b.then;
        return found;
    });
    return (0, core_1.computeValue)(obj, thenExpr !== null ? thenExpr : expr.default, null, options);
}
exports.$switch = $switch;


/***/ }),

/***/ 7308:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// Custom Aggregation Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#custom-aggregation-expression-operators
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$accumulator = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Defines a custom accumulator function.
 *
 * @param {Array} collection The input array
 * @param {*} expr The expression for the operator
 * @param {Options} options Options
 */
function $accumulator(collection, expr, options) {
    var _a, _b;
    (0, util_1.assert)(options.scriptEnabled, "$accumulator operator requires 'scriptEnabled' option to be true");
    if (collection.length == 0)
        return expr.initArgs;
    var initArgs = (0, core_1.computeValue)(options["groupId"] || {}, expr.initArgs || [], null, options);
    var state = (_a = expr.init).call.apply(_a, __spreadArray([null], initArgs, false));
    for (var i = 0; i < collection.length; i++) {
        // get arguments for document
        var args = (0, core_1.computeValue)(collection[i], expr.accumulateArgs, null, options);
        // update the state with each documents value
        state = (_b = expr.accumulate).call.apply(_b, __spreadArray([null], __spreadArray([state], args, true), false));
    }
    return (expr.finalize ? expr.finalize.call(null, state) : state);
}
exports.$accumulator = $accumulator;


/***/ }),

/***/ 7247:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Custom Aggregation Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#custom-aggregation-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$function = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Defines a custom function.
 *
 * @param {*} obj The target object for this expression
 * @param {*} expr The expression for the operator
 * @param {Options} options Options
 */
function $function(obj, expr, options) {
    (0, util_1.assert)(options.scriptEnabled, "$function operator requires 'scriptEnabled' option to be true");
    var fn = (0, core_1.computeValue)(obj, expr, null, options);
    return fn.body.apply(null, fn.args);
}
exports.$function = $function;


/***/ }),

/***/ 7057:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(7308), exports);
__exportStar(__webpack_require__(7247), exports);


/***/ }),

/***/ 3954:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.regexStrip = exports.regexQuote = exports.padDigits = exports.computeDate = exports.adjustDate = exports.formatTimezone = exports.parseTimezone = exports.DATE_SYM_TABLE = exports.DATE_PART_INTERVAL = exports.DATE_FORMAT = exports.DURATION_IN_MILLIS = exports.MILLIS_PER_DAY = exports.MINUTES_PER_HOUR = exports.isoWeekYear = exports.isoWeek = exports.getDayOfYear = exports.isLeapYear = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var COMMON_YEAR_DAYS_OFFSET = [
    0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
];
var LEAP_YEAR_DAYS_OFFSET = [
    0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335,
];
// https://en.wikipedia.org/wiki/ISO_week_date
var p = function (y) {
    return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7;
};
var weeks = function (y) { return 52 + Number(p(y) == 4 || p(y - 1) == 3); };
var isLeapYear = function (year) {
    return (year & 3) == 0 && (year % 100 != 0 || year % 400 == 0);
};
exports.isLeapYear = isLeapYear;
var getDayOfYear = function (d) {
    return ((0, exports.isLeapYear)(d.getUTCFullYear())
        ? LEAP_YEAR_DAYS_OFFSET
        : COMMON_YEAR_DAYS_OFFSET)[d.getUTCMonth()] + d.getUTCDate();
};
exports.getDayOfYear = getDayOfYear;
function isoWeek(d) {
    // algorithm based on https://en.wikipedia.org/wiki/ISO_week_date
    var w = Math.floor((10 + (0, exports.getDayOfYear)(d) - (d.getUTCDay() || 7)) / 7);
    if (w < 1)
        return weeks(d.getUTCFullYear() - 1);
    if (w > weeks(d.getUTCFullYear()))
        return 1;
    return w;
}
exports.isoWeek = isoWeek;
function isoWeekYear(d) {
    return (d.getUTCFullYear() -
        Number(d.getUTCMonth() == 0 && d.getUTCDate() == 1 && d.getUTCDay() < 1));
}
exports.isoWeekYear = isoWeekYear;
exports.MINUTES_PER_HOUR = 60;
exports.MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
exports.DURATION_IN_MILLIS = {
    week: exports.MILLIS_PER_DAY * 7,
    day: exports.MILLIS_PER_DAY,
    hour: 1000 * 60 * 60,
    minute: 1000 * 60,
    second: 1000,
    millisecond: 1,
};
// default format if unspecified
exports.DATE_FORMAT = "%Y-%m-%dT%H:%M:%S.%LZ";
// Inclusive interval of date parts
exports.DATE_PART_INTERVAL = [
    ["year", 0, 9999],
    ["month", 1, 12],
    ["day", 1, 31],
    ["hour", 0, 23],
    ["minute", 0, 59],
    ["second", 0, 59],
    ["millisecond", 0, 999],
];
// used for formatting dates in $dateToString operator
exports.DATE_SYM_TABLE = {
    "%Y": { name: "year", padding: 4, re: /([0-9]{4})/ },
    "%G": { name: "year", padding: 4, re: /([0-9]{4})/ },
    "%m": { name: "month", padding: 2, re: /(0[1-9]|1[012])/ },
    "%d": { name: "day", padding: 2, re: /(0[1-9]|[12][0-9]|3[01])/ },
    "%H": { name: "hour", padding: 2, re: /([01][0-9]|2[0-3])/ },
    "%M": { name: "minute", padding: 2, re: /([0-5][0-9])/ },
    "%S": { name: "second", padding: 2, re: /([0-5][0-9]|60)/ },
    "%L": { name: "millisecond", padding: 3, re: /([0-9]{3})/ },
    "%u": { name: "weekDay", padding: 1, re: /([1-7])/ },
    "%V": { name: "week", padding: 1, re: /([1-4][0-9]?|5[0-3]?)/ },
    "%z": {
        name: "timezone",
        padding: 2,
        re: /(([+-][01][0-9]|2[0-3]):?([0-5][0-9])?)/,
    },
    "%Z": { name: "minuteOffset", padding: 3, re: /([+-][0-9]{3})/ },
    // "%%": "%",
};
/**
 * Parse and return the timezone string as a number
 * @param tzstr Timezone string matching '+/-hh[:][mm]'
 */
function parseTimezone(tzstr) {
    if ((0, util_1.isNil)(tzstr))
        return 0;
    var m = exports.DATE_SYM_TABLE["%z"].re.exec(tzstr);
    if (!m)
        throw Error("invalid or location-based timezone '" + tzstr + "' not supported");
    var hr = parseInt(m[2]) || 0;
    var min = parseInt(m[3]) || 0;
    return (Math.abs(hr * exports.MINUTES_PER_HOUR) + min) * (hr < 0 ? -1 : 1);
}
exports.parseTimezone = parseTimezone;
/**
 * Formats the timezone for output
 * @param tz A timezone object
 */
function formatTimezone(minuteOffset) {
    return ((minuteOffset < 0 ? "-" : "+") +
        padDigits(Math.abs(Math.floor(minuteOffset / exports.MINUTES_PER_HOUR)), 2) +
        padDigits(Math.abs(minuteOffset) % exports.MINUTES_PER_HOUR, 2));
}
exports.formatTimezone = formatTimezone;
/**
 * Adjust the date by the given timezone
 * @param d Date object
 * @param minuteOffset number
 */
function adjustDate(d, minuteOffset) {
    d.setUTCMinutes(d.getUTCMinutes() + minuteOffset);
}
exports.adjustDate = adjustDate;
/**
 * Computes a date expression
 * @param obj The target object
 * @param expr Any value that resolves to a valid date expression. Valid expressions include a number, Date, or Object{date: number|Date, timezone?: string}
 */
function computeDate(obj, expr, options) {
    var d = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isDate)(d))
        return new Date(d);
    // timestamp is in seconds
    if ((0, util_1.isNumber)(d))
        return new Date(d * 1000);
    if (d.date) {
        var date = (0, util_1.isDate)(d.date) ? new Date(d.date) : new Date(d.date * 1000);
        if (d.timezone) {
            adjustDate(date, parseTimezone(d.timezone));
        }
        return date;
    }
    throw Error("cannot convert " + (expr === null || expr === void 0 ? void 0 : expr.toString()) + " to date");
}
exports.computeDate = computeDate;
function padDigits(n, digits) {
    return (new Array(Math.max(digits - String(n).length + 1, 0)).join("0") +
        n.toString());
}
exports.padDigits = padDigits;
function regexQuote(s) {
    "^.-*?$".split("").forEach(function (c) {
        s = s.replace(c, "\\" + c);
    });
    return s;
}
exports.regexQuote = regexQuote;
function regexStrip(s) {
    return s.replace(/^\//, "").replace(/\/$/, "");
}
exports.regexStrip = regexStrip;


/***/ }),

/***/ 8369:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$dateAdd = void 0;
var core_1 = __webpack_require__(7424);
var _internal_1 = __webpack_require__(3954);
/**
 * Increments a Date object by a specified number of time units.
 * @param obj
 * @param expr
 */
function $dateAdd(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var d = (0, _internal_1.computeDate)(obj, expr.startDate, options);
    switch (args.unit) {
        case "year":
            d.setUTCFullYear(d.getUTCFullYear() + args.amount);
            break;
        case "quarter":
            addMonth(d, 3 * args.amount);
            break;
        case "month":
            addMonth(d, args.amount);
            break;
        default:
            d.setTime(d.getTime() + _internal_1.DURATION_IN_MILLIS[args.unit] * args.amount);
    }
    if (args.timezone) {
        var tz = (0, _internal_1.parseTimezone)(args.timezone);
        (0, _internal_1.adjustDate)(d, tz);
    }
    return d;
}
exports.$dateAdd = $dateAdd;
function addMonth(d, amount) {
    // months start from 0 to 11.
    var m = d.getUTCMonth() + amount;
    var yearOffset = Math.floor(m / 12);
    if (m < 0) {
        var month = (m % 12) + 12;
        d.setUTCFullYear(d.getUTCFullYear() + yearOffset, month, d.getUTCDate());
    }
    else {
        d.setUTCFullYear(d.getUTCFullYear() + yearOffset, m % 12, d.getUTCDate());
    }
}


/***/ }),

/***/ 6354:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$dateFromParts = void 0;
var core_1 = __webpack_require__(7424);
var _internal_1 = __webpack_require__(3954);
var DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var getDaysInMonth = function (date) {
    return date.month == 2 && (0, _internal_1.isLeapYear)(date.year)
        ? 29
        : DAYS_IN_MONTH[date.month - 1];
};
/**
 * Constructs and returns a Date object given the date’s constituent properties.
 *
 * @param obj The document
 * @param expr The date expression
 * @param options Options
 */
function $dateFromParts(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var minuteOffset = (0, _internal_1.parseTimezone)(args.timezone);
    // assign default and adjust value ranges of the different parts
    for (var i = _internal_1.DATE_PART_INTERVAL.length - 1, remainder = 0; i >= 0; i--) {
        var datePartInterval = _internal_1.DATE_PART_INTERVAL[i];
        var k = datePartInterval[0];
        var min = datePartInterval[1];
        var max = datePartInterval[2];
        // add remainder from previous part. units should already be correct
        var part = (args[k] || 0) + remainder;
        // reset remainder now that it's been used.
        remainder = 0;
        // 1. compute the remainder for the next part
        // 2. adjust the current part to a valid range
        // 3. assign back to 'args'
        var limit = max + 1;
        // invert timezone to adjust the hours to UTC
        if (k == "hour")
            part += Math.floor(minuteOffset / _internal_1.MINUTES_PER_HOUR) * -1;
        if (k == "minute")
            part += (minuteOffset % _internal_1.MINUTES_PER_HOUR) * -1;
        // smaller than lower bound
        if (part < min) {
            var delta = min - part;
            remainder = -1 * Math.ceil(delta / limit);
            part = limit - (delta % limit);
        }
        else if (part > max) {
            // offset with the 'min' value to adjust non-zero date parts correctly
            part += min;
            remainder = Math.trunc(part / limit);
            part %= limit;
        }
        // reassign
        args[k] = part;
    }
    // adjust end of month to correctly handle overflows
    args.day = Math.min(args.day, getDaysInMonth(args));
    return new Date(Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, args.second, args.millisecond));
}
exports.$dateFromParts = $dateFromParts;


/***/ }),

/***/ 7491:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$dateFromString = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(3954);
var buildMap = function (letters, sign) {
    var h = {};
    letters.split("").forEach(function (v, i) { return (h[v] = sign * (i + 1)); });
    return h;
};
var TZ_LETTER_OFFSETS = __assign(__assign(__assign({}, buildMap("ABCDEFGHIKLM", 1)), buildMap("NOPQRSTUVWXY", -1)), { Z: 0 });
/**
 * Converts a date/time string to a date object.
 * @param obj
 * @param expr
 */
function $dateFromString(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    args.format = args.format || _internal_1.DATE_FORMAT;
    args.onNull = args.onNull || null;
    var dateString = args.dateString;
    if ((0, util_1.isNil)(dateString))
        return args.onNull;
    // collect all separators of the format string
    var separators = args.format.split(/%[YGmdHMSLuVzZ]/);
    separators.reverse();
    var matches = args.format.match(/(%%|%Y|%G|%m|%d|%H|%M|%S|%L|%u|%V|%z|%Z)/g);
    var dateParts = {};
    // holds the valid regex of parts that matches input date string
    var expectedPattern = "";
    for (var i = 0, len = matches.length; i < len; i++) {
        var formatSpecifier = matches[i];
        var props = _internal_1.DATE_SYM_TABLE[formatSpecifier];
        if ((0, util_1.isObject)(props)) {
            // get pattern and alias from table
            var m_1 = props.re.exec(dateString);
            // get the next separtor
            var delimiter = separators.pop() || "";
            if (m_1 !== null) {
                // store and cut out matched part
                dateParts[props.name] = /^\d+$/.exec(m_1[0]) ? parseInt(m_1[0]) : m_1[0];
                dateString =
                    dateString.substr(0, m_1.index) +
                        dateString.substr(m_1.index + m_1[0].length);
                // construct expected pattern
                expectedPattern +=
                    (0, _internal_1.regexQuote)(delimiter) + (0, _internal_1.regexStrip)(props.re.toString());
            }
            else {
                dateParts[props.name] = null;
            }
        }
    }
    // 1. validate all required date parts exists
    // 2. validate original dateString against expected pattern.
    if ((0, util_1.isNil)(dateParts.year) ||
        (0, util_1.isNil)(dateParts.month) ||
        (0, util_1.isNil)(dateParts.day) ||
        !new RegExp("^" + expectedPattern + "[A-Z]?$").exec(args.dateString)) {
        return args.onError;
    }
    var m = args.dateString.match(/([A-Z])$/);
    (0, util_1.assert)(
    // only one of in-date timeone or timezone argument but not both.
    !(m && args.timezone), "$dateFromString: you cannot pass in a date/time string with time zone information ('" + (m && m[0]) + "') together with a timezone argument");
    var minuteOffset = m
        ? TZ_LETTER_OFFSETS[m[0]] * _internal_1.MINUTES_PER_HOUR
        : (0, _internal_1.parseTimezone)(args.timezone);
    // create the date. month is 0-based in Date
    var d = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0));
    if (!(0, util_1.isNil)(dateParts.hour))
        d.setUTCHours(dateParts.hour);
    if (!(0, util_1.isNil)(dateParts.minute))
        d.setUTCMinutes(dateParts.minute);
    if (!(0, util_1.isNil)(dateParts.second))
        d.setUTCSeconds(dateParts.second);
    if (!(0, util_1.isNil)(dateParts.millisecond))
        d.setUTCMilliseconds(dateParts.millisecond);
    // adjust to the correct represention for UTC
    (0, _internal_1.adjustDate)(d, -minuteOffset);
    return d;
}
exports.$dateFromString = $dateFromString;


/***/ }),

/***/ 1589:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$dateSubtract = void 0;
var core_1 = __webpack_require__(7424);
var __1 = __webpack_require__(6234);
/**
 * Decrements a Date object by a specified number of time units.
 * @param obj
 * @param expr
 */
function $dateSubtract(obj, expr, options) {
    var amount = (0, core_1.computeValue)(obj, expr === null || expr === void 0 ? void 0 : expr.amount, null, options);
    return (0, __1.$dateAdd)(obj, __assign(__assign({}, expr), { amount: -1 * amount }), options);
}
exports.$dateSubtract = $dateSubtract;


/***/ }),

/***/ 2038:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$dateToParts = void 0;
var core_1 = __webpack_require__(7424);
var _internal_1 = __webpack_require__(3954);
/**
 * Returns a document that contains the constituent parts of a given Date value as individual properties.
 * The properties returned are year, month, day, hour, minute, second and millisecond.
 *
 * @param obj
 * @param expr
 * @param options
 */
function $dateToParts(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var d = new Date(args.date);
    var tz = (0, _internal_1.parseTimezone)(args.timezone);
    // invert timezone to construct value in UTC
    (0, _internal_1.adjustDate)(d, -tz);
    var timePart = {
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
        millisecond: d.getUTCMilliseconds(),
    };
    if (args.iso8601 == true) {
        return Object.assign(timePart, {
            isoWeekYear: (0, _internal_1.isoWeekYear)(d),
            isoWeek: (0, _internal_1.isoWeek)(d),
            isoDayOfWeek: d.getUTCDay() || 7,
        });
    }
    return Object.assign(timePart, {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
    });
}
exports.$dateToParts = $dateToParts;


/***/ }),

/***/ 943:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$dateToString = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(3954);
var dayOfMonth_1 = __webpack_require__(5803);
var dayOfWeek_1 = __webpack_require__(6455);
var hour_1 = __webpack_require__(6686);
var millisecond_1 = __webpack_require__(2637);
var minute_1 = __webpack_require__(9859);
var month_1 = __webpack_require__(858);
var second_1 = __webpack_require__(5457);
var week_1 = __webpack_require__(473);
var year_1 = __webpack_require__(9386);
// date functions for format specifiers
var DATE_FUNCTIONS = {
    "%Y": year_1.$year,
    "%G": year_1.$year,
    "%m": month_1.$month,
    "%d": dayOfMonth_1.$dayOfMonth,
    "%H": hour_1.$hour,
    "%M": minute_1.$minute,
    "%S": second_1.$second,
    "%L": millisecond_1.$millisecond,
    "%u": dayOfWeek_1.$dayOfWeek,
    "%V": week_1.$week,
};
/**
 * Returns the date as a formatted string.
 *
 * %d	Day of Month (2 digits, zero padded)	01-31
 * %G	Year in ISO 8601 format	0000-9999
 * %H	Hour (2 digits, zero padded, 24-hour clock)	00-23
 * %L	Millisecond (3 digits, zero padded)	000-999
 * %m	Month (2 digits, zero padded)	01-12
 * %M	Minute (2 digits, zero padded)	00-59
 * %S	Second (2 digits, zero padded)	00-60
 * %u	Day of week number in ISO 8601 format (1-Monday, 7-Sunday)	1-7
 * %V	Week of Year in ISO 8601 format	1-53
 * %Y	Year (4 digits, zero padded)	0000-9999
 * %z	The timezone offset from UTC.	+/-[hh][mm]
 * %Z	The minutes offset from UTC as a number. For example, if the timezone offset (+/-[hhmm]) was +0445, the minutes offset is +285.	+/-mmm
 * %%	Percent Character as a Literal	%
 *
 * @param obj current object
 * @param expr operator expression
 */
function $dateToString(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(args.onNull))
        args.onNull = null;
    if ((0, util_1.isNil)(args.date))
        return args.onNull;
    var date = (0, _internal_1.computeDate)(obj, args.date, options);
    var format = args.format || _internal_1.DATE_FORMAT;
    var minuteOffset = (0, _internal_1.parseTimezone)(args.timezone);
    var matches = format.match(/(%%|%Y|%G|%m|%d|%H|%M|%S|%L|%u|%V|%z|%Z)/g);
    // adjust the date to reflect timezone
    (0, _internal_1.adjustDate)(date, minuteOffset);
    for (var i = 0, len = matches.length; i < len; i++) {
        var formatSpecifier = matches[i];
        var props = _internal_1.DATE_SYM_TABLE[formatSpecifier];
        var operatorFn = DATE_FUNCTIONS[formatSpecifier];
        var value = void 0;
        if ((0, util_1.isObject)(props)) {
            // reuse date
            if (props.name === "timezone") {
                value = (0, _internal_1.formatTimezone)(minuteOffset);
            }
            else if (props.name === "minuteOffset") {
                value = minuteOffset.toString();
            }
            else {
                (0, util_1.assert)(!!operatorFn, "unsupported date format specifier '" + formatSpecifier + "'");
                value = (0, _internal_1.padDigits)(operatorFn(obj, date, options), props.padding);
            }
        }
        // replace the match with resolved value
        format = format.replace(formatSpecifier, value);
    }
    return format;
}
exports.$dateToString = $dateToString;


/***/ }),

/***/ 5803:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$dayOfMonth = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the day of the month for a date as a number between 1 and 31.
 * @param obj
 * @param expr
 */
function $dayOfMonth(obj, expr, options) {
    return (0, _internal_1.computeDate)(obj, expr, options).getUTCDate();
}
exports.$dayOfMonth = $dayOfMonth;


/***/ }),

/***/ 6455:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$dayOfWeek = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the day of the week for a date as a number between 1 (Sunday) and 7 (Saturday).
 * @param obj
 * @param expr
 */
function $dayOfWeek(obj, expr, options) {
    return (0, _internal_1.computeDate)(obj, expr, options).getUTCDay() + 1;
}
exports.$dayOfWeek = $dayOfWeek;


/***/ }),

/***/ 9916:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$dayOfYear = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the day of the year for a date as a number between 1 and 366 (leap year).
 * @param obj
 * @param expr
 */
function $dayOfYear(obj, expr, options) {
    return (0, _internal_1.getDayOfYear)((0, _internal_1.computeDate)(obj, expr, options));
}
exports.$dayOfYear = $dayOfYear;


/***/ }),

/***/ 6686:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$hour = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the hour for a date as a number between 0 and 23.
 * @param obj
 * @param expr
 */
function $hour(obj, expr, options) {
    return (0, _internal_1.computeDate)(obj, expr, options).getUTCHours();
}
exports.$hour = $hour;


/***/ }),

/***/ 5832:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(8369), exports);
__exportStar(__webpack_require__(6354), exports);
__exportStar(__webpack_require__(7491), exports);
__exportStar(__webpack_require__(1589), exports);
__exportStar(__webpack_require__(2038), exports);
__exportStar(__webpack_require__(943), exports);
__exportStar(__webpack_require__(5803), exports);
__exportStar(__webpack_require__(6455), exports);
__exportStar(__webpack_require__(9916), exports);
__exportStar(__webpack_require__(6686), exports);
__exportStar(__webpack_require__(3834), exports);
__exportStar(__webpack_require__(1211), exports);
__exportStar(__webpack_require__(6532), exports);
__exportStar(__webpack_require__(2637), exports);
__exportStar(__webpack_require__(9859), exports);
__exportStar(__webpack_require__(858), exports);
__exportStar(__webpack_require__(5457), exports);
__exportStar(__webpack_require__(473), exports);
__exportStar(__webpack_require__(9386), exports);


/***/ }),

/***/ 3834:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$isoDayOfWeek = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the weekday number in ISO 8601 format, ranging from 1 (for Monday) to 7 (for Sunday).
 * @param obj
 * @param expr
 */
function $isoDayOfWeek(obj, expr, options) {
    return (0, _internal_1.computeDate)(obj, expr, options).getUTCDay() || 7;
}
exports.$isoDayOfWeek = $isoDayOfWeek;


/***/ }),

/***/ 1211:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$isoWeek = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the week number in ISO 8601 format, ranging from 1 to 53.
 * Week numbers start at 1 with the week (Monday through Sunday) that contains the year's first Thursday.
 * @param obj
 * @param expr
 */
function $isoWeek(obj, expr, options) {
    return (0, _internal_1.isoWeek)((0, _internal_1.computeDate)(obj, expr, options));
}
exports.$isoWeek = $isoWeek;


/***/ }),

/***/ 6532:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$isoWeekYear = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the year number in ISO 8601 format. The year starts with the Monday of week 1 and ends with the Sunday of the last week.
 * @param obj
 * @param expr
 */
function $isoWeekYear(obj, expr, options) {
    var d = (0, _internal_1.computeDate)(obj, expr, options);
    return (d.getUTCFullYear() -
        Number(d.getUTCMonth() == 0 && d.getUTCDate() == 1 && d.getUTCDay() < 1));
}
exports.$isoWeekYear = $isoWeekYear;


/***/ }),

/***/ 2637:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$millisecond = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the milliseconds of a date as a number between 0 and 999.
 * @param obj
 * @param expr
 */
function $millisecond(obj, expr, options) {
    return (0, _internal_1.computeDate)(obj, expr, options).getUTCMilliseconds();
}
exports.$millisecond = $millisecond;


/***/ }),

/***/ 9859:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$minute = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the minute for a date as a number between 0 and 59.
 * @param obj
 * @param expr
 */
function $minute(obj, expr, options) {
    return (0, _internal_1.computeDate)(obj, expr, options).getUTCMinutes();
}
exports.$minute = $minute;


/***/ }),

/***/ 858:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$month = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the month for a date as a number between 1 (January) and 12 (December).
 * @param obj
 * @param expr
 */
function $month(obj, expr, options) {
    return (0, _internal_1.computeDate)(obj, expr, options).getUTCMonth() + 1;
}
exports.$month = $month;


/***/ }),

/***/ 5457:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$second = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the seconds for a date as a number between 0 and 60 (leap seconds).
 * @param obj
 * @param expr
 */
function $second(obj, expr, options) {
    return (0, _internal_1.computeDate)(obj, expr, options).getUTCSeconds();
}
exports.$second = $second;


/***/ }),

/***/ 473:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$week = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the week of the year for a date as a number between 0 and 53.
 * Weeks begin on Sundays, and week 1 begins with the first Sunday of the year. Days preceding the first Sunday of the year are in week 0
 * @param obj
 * @param expr
 */
function $week(obj, expr, options) {
    var d = (0, _internal_1.computeDate)(obj, expr, options);
    var result = (0, _internal_1.isoWeek)(d);
    // check for starting of year and adjust accordingly
    if (d.getUTCDay() > 0 && d.getUTCDate() == 1 && d.getUTCMonth() == 0)
        return 0;
    // adjust for week start on Sunday
    if (d.getUTCDay() == 0)
        return result + 1;
    // else
    return result;
}
exports.$week = $week;


/***/ }),

/***/ 9386:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Date Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#date-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$year = void 0;
var _internal_1 = __webpack_require__(3954);
/**
 * Returns the year for a date as a number (e.g. 2014).
 * @param obj
 * @param expr
 */
function $year(obj, expr, options) {
    return (0, _internal_1.computeDate)(obj, expr, options).getUTCFullYear();
}
exports.$year = $year;


/***/ }),

/***/ 6234:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(6665), exports);
__exportStar(__webpack_require__(3142), exports);
__exportStar(__webpack_require__(5039), exports);
__exportStar(__webpack_require__(6312), exports);
__exportStar(__webpack_require__(5528), exports);
__exportStar(__webpack_require__(7057), exports);
__exportStar(__webpack_require__(5832), exports);
__exportStar(__webpack_require__(6103), exports);
__exportStar(__webpack_require__(9925), exports);
__exportStar(__webpack_require__(8981), exports);
__exportStar(__webpack_require__(1767), exports);
__exportStar(__webpack_require__(2937), exports);
__exportStar(__webpack_require__(2090), exports);
__exportStar(__webpack_require__(2040), exports);
__exportStar(__webpack_require__(6752), exports);


/***/ }),

/***/ 6103:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// Literal Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#literal-expression-operator
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$literal = void 0;
/**
 * Return a value without parsing.
 * @param obj
 * @param expr
 * @param options
 */
function $literal(obj, expr, options) {
    return expr;
}
exports.$literal = $literal;


/***/ }),

/***/ 571:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Miscellaneous Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/rand/#mongodb-expression-exp.-rand
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$getField = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Adds, updates, or removes a specified field in a document.
 *
 * @param {*} obj The target object for this expression
 * @param {*} expr The right-hand side of the operator
 * @param {Options} options Options to use for operation
 */
function $getField(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var input = obj;
    var field = args;
    if ((0, util_1.isObject)(args) && args.input && args.field) {
        input = args.input;
        field = args.field;
    }
    if ((0, util_1.isNil)(input))
        return null;
    (0, util_1.assert)((0, util_1.isObject)(input), "$getField expression 'input' must evaluate to an object");
    (0, util_1.assert)((0, util_1.isString)(field), "$getField expression 'field' must evaluate to a string");
    return input[field];
}
exports.$getField = $getField;


/***/ }),

/***/ 9925:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(571), exports);
__exportStar(__webpack_require__(1227), exports);
__exportStar(__webpack_require__(656), exports);


/***/ }),

/***/ 1227:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// Miscellaneous Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/rand/#mongodb-expression-exp.-rand
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$rand = void 0;
/**
 * Returns a random float between 0 and 1.
 *
 * @param {*} obj The target object for this expression
 * @param {*} expr The right-hand side of the operator
 * @param {Options} options Options to use for operation
 */
var $rand = function (obj, expr, options) { return Math.random(); };
exports.$rand = $rand;


/***/ }),

/***/ 656:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Miscellaneous Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#miscellaneous-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$sampleRate = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Randomly select documents at a given rate.
 *
 * @param {*} obj The target object for this expression
 * @param {*} expr The right-hand side of the operator
 * @param {Options} options Options to use for operation
 */
var $sampleRate = function (obj, expr, options) { return Math.random() <= (0, core_1.computeValue)(obj, expr, null, options); };
exports.$sampleRate = $sampleRate;


/***/ }),

/***/ 8981:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(934), exports);
__exportStar(__webpack_require__(9841), exports);
__exportStar(__webpack_require__(7185), exports);
__exportStar(__webpack_require__(8261), exports);


/***/ }),

/***/ 934:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Object Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#object-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$mergeObjects = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Combines multiple documents into a single document.
 *
 * @param {*} obj The target object for this expression
 * @param {*} expr The right-hand side of the operator
 * @param {Options} options Options to use for operation
 */
function $mergeObjects(obj, expr, options) {
    var docs = (0, core_1.computeValue)(obj, expr, null, options);
    return docs instanceof Array
        ? docs.reduce(function (memo, o) { return (0, util_1.into)(memo, o); }, {})
        : {};
}
exports.$mergeObjects = $mergeObjects;


/***/ }),

/***/ 9841:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Object Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#object-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$objectToArray = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Converts a document to an array of documents representing key-value pairs.
 *
 * @param {*} obj The target object for this expression
 * @param {*} expr The right-hand side of the operator
 * @param {Options} options Options to use for operation
 */
function $objectToArray(obj, expr, options) {
    var val = (0, core_1.computeValue)(obj, expr, null, options);
    (0, util_1.assert)((0, util_1.isObject)(val), "$objectToArray expression must resolve to an object");
    var result = [];
    for (var _i = 0, _a = Object.entries(val); _i < _a.length; _i++) {
        var _b = _a[_i], k = _b[0], v = _b[1];
        result.push({ k: k, v: v });
    }
    return result;
}
exports.$objectToArray = $objectToArray;


/***/ }),

/***/ 7185:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Object Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#object-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$setField = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Adds, updates, or removes a specified field in a document.
 *
 * @param {*} obj The target object for this expression
 * @param {*} expr The right-hand side of the operator
 * @param {Options} options Options to use for operation
 */
function $setField(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(args.input))
        return null;
    (0, util_1.assert)((0, util_1.isObject)(args.input), "$setField expression 'input' must evaluate to an object");
    (0, util_1.assert)((0, util_1.isString)(args.field), "$setField expression 'field' must evaluate to a string");
    if (expr.value == "$$REMOVE") {
        delete obj[args.field];
    }
    else {
        obj[args.field] = args.value;
    }
    return obj;
}
exports.$setField = $setField;


/***/ }),

/***/ 8261:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// Object Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#object-expression-operators
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$unsetField = void 0;
var _1 = __webpack_require__(8981);
/**
 * Adds, updates, or removes a specified field in a document.
 *
 * @param {*} obj The target object for this expression
 * @param {*} expr The right-hand side of the operator
 * @param {Options} options Options to use for operation
 */
function $unsetField(obj, expr, options) {
    return (0, _1.$setField)(obj, __assign(__assign({}, expr), { value: "$$REMOVE" }), options);
}
exports.$unsetField = $unsetField;


/***/ }),

/***/ 3280:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Set Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#set-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$allElementsTrue = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns true if all elements of a set evaluate to true, and false otherwise.
 * @param obj
 * @param expr
 */
function $allElementsTrue(obj, expr, options) {
    // mongodb nests the array expression in another
    var args = (0, core_1.computeValue)(obj, expr, null, options)[0];
    return args.every(util_1.truthy);
}
exports.$allElementsTrue = $allElementsTrue;


/***/ }),

/***/ 8248:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Set Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#set-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$anyElementTrue = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns true if any elements of a set evaluate to true, and false otherwise.
 * @param obj
 * @param expr
 */
function $anyElementTrue(obj, expr, options) {
    // mongodb nests the array expression in another
    var args = (0, core_1.computeValue)(obj, expr, null, options)[0];
    return args.some(util_1.truthy);
}
exports.$anyElementTrue = $anyElementTrue;


/***/ }),

/***/ 1767:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(3280), exports);
__exportStar(__webpack_require__(8248), exports);
__exportStar(__webpack_require__(5910), exports);
__exportStar(__webpack_require__(7972), exports);
__exportStar(__webpack_require__(3855), exports);
__exportStar(__webpack_require__(979), exports);
__exportStar(__webpack_require__(8903), exports);


/***/ }),

/***/ 5910:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Set Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#set-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$setDifference = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns elements of a set that do not appear in a second set.
 * @param obj
 * @param expr
 */
function $setDifference(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    return args[0].filter(util_1.notInArray.bind(null, args[1]));
}
exports.$setDifference = $setDifference;


/***/ }),

/***/ 7972:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Set Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#set-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$setEquals = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns true if two sets have the same elements.
 * @param obj
 * @param expr
 */
function $setEquals(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var xs = (0, util_1.unique)(args[0], options === null || options === void 0 ? void 0 : options.hashFunction);
    var ys = (0, util_1.unique)(args[1], options === null || options === void 0 ? void 0 : options.hashFunction);
    return (xs.length === ys.length &&
        xs.length === (0, util_1.intersection)([xs, ys], options === null || options === void 0 ? void 0 : options.hashFunction).length);
}
exports.$setEquals = $setEquals;


/***/ }),

/***/ 3855:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Set Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#set-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$setIntersection = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns the common elements of the input sets.
 * @param obj
 * @param expr
 */
function $setIntersection(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    (0, util_1.assert)((0, util_1.isArray)(args) && args.every(util_1.isArray), "$setIntersection: expresssion must resolve to array of arrays");
    return (0, util_1.intersection)(args, options === null || options === void 0 ? void 0 : options.hashFunction);
}
exports.$setIntersection = $setIntersection;


/***/ }),

/***/ 979:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Set Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#set-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$setIsSubset = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns true if all elements of a set appear in a second set.
 * @param obj
 * @param expr
 */
function $setIsSubset(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    return (0, util_1.intersection)(args, options === null || options === void 0 ? void 0 : options.hashFunction).length === args[0].length;
}
exports.$setIsSubset = $setIsSubset;


/***/ }),

/***/ 8903:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Set Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#set-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$setUnion = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns a set that holds all elements of the input sets.
 * @param obj
 * @param expr
 */
function $setUnion(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    (0, util_1.assert)((0, util_1.isArray)(args) && args.length == 2 && args.every(util_1.isArray), "$setUnion: arguments must be arrays");
    return (0, util_1.unique)(args[0].concat(args[1]), options === null || options === void 0 ? void 0 : options.hashFunction);
}
exports.$setUnion = $setUnion;


/***/ }),

/***/ 9875:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.regexSearch = exports.trimString = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var WHITESPACE_CHARS = [
    0x0000,
    0x0020,
    0x0009,
    0x000a,
    0x000b,
    0x000c,
    0x000d,
    0x00a0,
    0x1680,
    0x2000,
    0x2001,
    0x2002,
    0x2003,
    0x2004,
    0x2005,
    0x2006,
    0x2007,
    0x2008,
    0x2009,
    0x200a, // Hair space
];
/**
 * Trims the resolved string
 *
 * @param obj
 * @param expr
 * @param options
 */
function trimString(obj, expr, options, trimOpts) {
    var val = (0, core_1.computeValue)(obj, expr, null, options);
    var s = val.input;
    if ((0, util_1.isNil)(s))
        return null;
    var codepoints = (0, util_1.isNil)(val.chars)
        ? WHITESPACE_CHARS
        : val.chars.split("").map(function (c) { return c.codePointAt(0); });
    var i = 0;
    var j = s.length - 1;
    while (trimOpts.left &&
        i <= j &&
        codepoints.indexOf(s[i].codePointAt(0)) !== -1)
        i++;
    while (trimOpts.right &&
        i <= j &&
        codepoints.indexOf(s[j].codePointAt(0)) !== -1)
        j--;
    return s.substring(i, j + 1);
}
exports.trimString = trimString;
/**
 * Performs a regex search
 *
 * @param obj
 * @param expr
 * @param opts
 */
function regexSearch(obj, expr, options, reOpts) {
    var val = (0, core_1.computeValue)(obj, expr, null, options);
    if (!(0, util_1.isString)(val.input))
        return [];
    var regexOptions = val.options;
    if (regexOptions) {
        (0, util_1.assert)(regexOptions.indexOf("x") === -1, "extended capability option 'x' not supported");
        (0, util_1.assert)(regexOptions.indexOf("g") === -1, "global option 'g' not supported");
    }
    var input = val.input;
    var re = new RegExp(val.regex, regexOptions);
    var m;
    var matches = [];
    var offset = 0;
    while ((m = re.exec(input))) {
        var result = {
            match: m[0],
            idx: m.index + offset,
            captures: [],
        };
        for (var i = 1; i < m.length; i++) {
            result.captures.push(m[i] || null);
        }
        matches.push(result);
        if (!reOpts.global)
            break;
        offset = m.index + m[0].length;
        input = input.substr(offset);
    }
    return matches;
}
exports.regexSearch = regexSearch;


/***/ }),

/***/ 6210:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$concat = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Concatenates two strings.
 *
 * @param obj
 * @param expr
 * @returns {string|*}
 */
function $concat(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    // does not allow concatenation with nulls
    if ([null, undefined].some(util_1.inArray.bind(null, args)))
        return null;
    return args.join("");
}
exports.$concat = $concat;


/***/ }),

/***/ 2937:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(6210), exports);
__exportStar(__webpack_require__(3405), exports);
__exportStar(__webpack_require__(2599), exports);
__exportStar(__webpack_require__(362), exports);
__exportStar(__webpack_require__(2539), exports);
__exportStar(__webpack_require__(4506), exports);
__exportStar(__webpack_require__(7304), exports);
__exportStar(__webpack_require__(5881), exports);
__exportStar(__webpack_require__(4133), exports);
__exportStar(__webpack_require__(7874), exports);
__exportStar(__webpack_require__(5363), exports);
__exportStar(__webpack_require__(6095), exports);
__exportStar(__webpack_require__(5547), exports);
__exportStar(__webpack_require__(2051), exports);
__exportStar(__webpack_require__(2060), exports);
__exportStar(__webpack_require__(8224), exports);
__exportStar(__webpack_require__(1110), exports);
__exportStar(__webpack_require__(9826), exports);
__exportStar(__webpack_require__(597), exports);


/***/ }),

/***/ 3405:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$indexOfBytes = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Searches a string for an occurrence of a substring and returns the UTF-8 code point index of the first occurence.
 * If the substring is not found, returns -1.
 *
 * @param  {Object} obj
 * @param  {*} expr
 * @return {*}
 */
function $indexOfBytes(obj, expr, options) {
    var arr = (0, core_1.computeValue)(obj, expr, null, options);
    var errorMsg = "$indexOfBytes expression resolves to invalid an argument";
    if ((0, util_1.isNil)(arr[0]))
        return null;
    (0, util_1.assert)((0, util_1.isString)(arr[0]) && (0, util_1.isString)(arr[1]), errorMsg);
    var str = arr[0];
    var searchStr = arr[1];
    var start = arr[2];
    var end = arr[3];
    var valid = (0, util_1.isNil)(start) ||
        ((0, util_1.isNumber)(start) && start >= 0 && Math.round(start) === start);
    valid =
        valid &&
            ((0, util_1.isNil)(end) || ((0, util_1.isNumber)(end) && end >= 0 && Math.round(end) === end));
    (0, util_1.assert)(valid, errorMsg);
    start = start || 0;
    end = end || str.length;
    if (start > end)
        return -1;
    var index = str.substring(start, end).indexOf(searchStr);
    return index > -1 ? index + start : index;
}
exports.$indexOfBytes = $indexOfBytes;


/***/ }),

/***/ 2599:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$ltrim = void 0;
var _internal_1 = __webpack_require__(9875);
/**
 * Removes whitespace characters, including null, or the specified characters from the beginning of a string.
 *
 * @param obj
 * @param expr
 */
function $ltrim(obj, expr, options) {
    return (0, _internal_1.trimString)(obj, expr, options, { left: true, right: false });
}
exports.$ltrim = $ltrim;


/***/ }),

/***/ 362:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$regexFind = void 0;
var _internal_1 = __webpack_require__(9875);
/**
 * Applies a regular expression (regex) to a string and returns information on the first matched substring.
 *
 * @param obj
 * @param expr
 */
function $regexFind(obj, expr, options) {
    var result = (0, _internal_1.regexSearch)(obj, expr, options, { global: false });
    return result.length === 0 ? null : result[0];
}
exports.$regexFind = $regexFind;


/***/ }),

/***/ 2539:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$regexFindAll = void 0;
var _internal_1 = __webpack_require__(9875);
/**
 * Applies a regular expression (regex) to a string and returns information on the all matched substrings.
 *
 * @param obj
 * @param expr
 */
function $regexFindAll(obj, expr, options) {
    return (0, _internal_1.regexSearch)(obj, expr, options, { global: true });
}
exports.$regexFindAll = $regexFindAll;


/***/ }),

/***/ 4506:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$regexMatch = void 0;
var _internal_1 = __webpack_require__(9875);
/**
 * Applies a regular expression (regex) to a string and returns a boolean that indicates if a match is found or not.
 *
 * @param obj
 * @param expr
 */
function $regexMatch(obj, expr, options) {
    return (0, _internal_1.regexSearch)(obj, expr, options, { global: false }).length != 0;
}
exports.$regexMatch = $regexMatch;


/***/ }),

/***/ 7304:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$replaceAll = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Replaces all instances of a matched string in a given input.
 *
 * @param  {Object} obj
 * @param  {Array} expr
 */
function $replaceAll(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var arr = [args.input, args.find, args.replacement];
    if (arr.some(util_1.isNil))
        return null;
    (0, util_1.assert)(arr.every(util_1.isString), "$replaceAll expression fields must evaluate to string");
    return args.input.replace(new RegExp(args.find, "g"), args.replacement);
}
exports.$replaceAll = $replaceAll;


/***/ }),

/***/ 5881:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$replaceOne = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Replaces the first instance of a matched string in a given input.
 *
 * @param  {Object} obj
 * @param  {Array} expr
 */
function $replaceOne(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var arr = [args.input, args.find, args.replacement];
    if (arr.some(util_1.isNil))
        return null;
    (0, util_1.assert)(arr.every(util_1.isString), "$replaceOne expression fields must evaluate to string");
    return args.input.replace(args.find, args.replacement);
}
exports.$replaceOne = $replaceOne;


/***/ }),

/***/ 4133:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$rtrim = void 0;
var _internal_1 = __webpack_require__(9875);
/**
 * Removes whitespace characters, including null, or the specified characters from the end of a string.
 *
 * @param obj
 * @param expr
 */
function $rtrim(obj, expr, options) {
    return (0, _internal_1.trimString)(obj, expr, options, { left: false, right: true });
}
exports.$rtrim = $rtrim;


/***/ }),

/***/ 7874:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$split = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Splits a string into substrings based on a delimiter.
 * If the delimiter is not found within the string, returns an array containing the original string.
 *
 * @param  {Object} obj
 * @param  {Array} expr
 * @return {Array} Returns an array of substrings.
 */
function $split(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(args[0]))
        return null;
    (0, util_1.assert)(args.every(util_1.isString), "$split expression must result to array(2) of strings");
    return args[0].split(args[1]);
}
exports.$split = $split;


/***/ }),

/***/ 6095:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$strLenBytes = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Returns the number of UTF-8 encoded bytes in the specified string.
 *
 * @param  {Object} obj
 * @param  {String} expr
 * @return {Number}
 */
function $strLenBytes(obj, expr, options) {
    return ~-encodeURI((0, core_1.computeValue)(obj, expr, null, options)).split(/%..|./).length;
}
exports.$strLenBytes = $strLenBytes;


/***/ }),

/***/ 5547:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$strLenCP = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Returns the number of UTF-8 code points in the specified string.
 *
 * @param  {Object} obj
 * @param  {String} expr
 * @return {Number}
 */
function $strLenCP(obj, expr, options) {
    return (0, core_1.computeValue)(obj, expr, null, options).length;
}
exports.$strLenCP = $strLenCP;


/***/ }),

/***/ 5363:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$strcasecmp = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Compares two strings and returns an integer that reflects the comparison.
 *
 * @param obj
 * @param expr
 * @returns {number}
 */
function $strcasecmp(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var a = args[0];
    var b = args[1];
    if ((0, util_1.isEqual)(a, b) || args.every(util_1.isNil))
        return 0;
    (0, util_1.assert)(args.every(util_1.isString), "$strcasecmp must resolve to array(2) of strings");
    a = a.toUpperCase();
    b = b.toUpperCase();
    return (a > b && 1) || (a < b && -1) || 0;
}
exports.$strcasecmp = $strcasecmp;


/***/ }),

/***/ 2051:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$substr = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns a substring of a string, starting at a specified index position and including the specified number of characters.
 * The index is zero-based.
 *
 * @param obj
 * @param expr
 * @returns {string}
 */
function $substr(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var s = args[0];
    var index = args[1];
    var count = args[2];
    if ((0, util_1.isString)(s)) {
        if (index < 0) {
            return "";
        }
        else if (count < 0) {
            return s.substr(index);
        }
        else {
            return s.substr(index, count);
        }
    }
    return "";
}
exports.$substr = $substr;


/***/ }),

/***/ 2060:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$substrBytes = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var UTF8_MASK = [0xc0, 0xe0, 0xf0];
// encodes a unicode code point to a utf8 byte sequence
// https://encoding.spec.whatwg.org/#utf-8
function toUtf8(n) {
    if (n < 0x80)
        return [n];
    var count = (n < 0x0800 && 1) || (n < 0x10000 && 2) || 3;
    var offset = UTF8_MASK[count - 1];
    var utf8 = [(n >> (6 * count)) + offset];
    while (count > 0)
        utf8.push(0x80 | ((n >> (6 * --count)) & 0x3f));
    return utf8;
}
function utf8Encode(s) {
    var buf = [];
    for (var i = 0, len = s.length; i < len; i++) {
        buf.push(toUtf8(s.codePointAt(i)));
    }
    return buf;
}
/**
 * Returns a substring of a string, starting at a specified index position and including the specified number of characters.
 * The index is zero-based.
 *
 * @param obj
 * @param expr
 * @returns {string}
 */
function $substrBytes(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    var s = args[0];
    var index = args[1];
    var count = args[2];
    (0, util_1.assert)((0, util_1.isString)(s) &&
        (0, util_1.isNumber)(index) &&
        index >= 0 &&
        (0, util_1.isNumber)(count) &&
        count >= 0, "$substrBytes: invalid arguments");
    var buf = utf8Encode(s);
    var validIndex = [];
    var acc = 0;
    for (var i = 0; i < buf.length; i++) {
        validIndex.push(acc);
        acc += buf[i].length;
    }
    var begin = validIndex.indexOf(index);
    var end = validIndex.indexOf(index + count);
    (0, util_1.assert)(begin > -1 && end > -1, "$substrBytes: invalid range, start or end index is a UTF-8 continuation byte.");
    return s.substring(begin, end);
}
exports.$substrBytes = $substrBytes;


/***/ }),

/***/ 8224:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$substrCP = void 0;
var substr_1 = __webpack_require__(2051);
function $substrCP(obj, expr, options) {
    return (0, substr_1.$substr)(obj, expr, options);
}
exports.$substrCP = $substrCP;


/***/ }),

/***/ 1110:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$toLower = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Converts a string to lowercase.
 *
 * @param obj
 * @param expr
 * @returns {string}
 */
function $toLower(obj, expr, options) {
    var value = (0, core_1.computeValue)(obj, expr, null, options);
    return (0, util_1.isEmpty)(value) ? "" : value.toLowerCase();
}
exports.$toLower = $toLower;


/***/ }),

/***/ 9826:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$toUpper = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Converts a string to uppercase.
 *
 * @param obj
 * @param expr
 * @returns {string}
 */
function $toUpper(obj, expr, options) {
    var value = (0, core_1.computeValue)(obj, expr, null, options);
    return (0, util_1.isEmpty)(value) ? "" : value.toUpperCase();
}
exports.$toUpper = $toUpper;


/***/ }),

/***/ 597:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * String Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#string-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$trim = void 0;
var _internal_1 = __webpack_require__(9875);
/**
 * Removes whitespace characters, including null, or the specified characters from the beginning and end of a string.
 *
 * @param obj
 * @param expr
 */
function $trim(obj, expr, options) {
    return (0, _internal_1.trimString)(obj, expr, options, { left: true, right: true });
}
exports.$trim = $trim;


/***/ }),

/***/ 2409:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createTrignometryOperator = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns an operator for a given trignometric function
 *
 * @param f The trignometric function
 */
function createTrignometryOperator(f, returnInfinity) {
    return function (obj, expr, options) {
        var n = (0, core_1.computeValue)(obj, expr, null, options);
        if (isNaN(n) || (0, util_1.isNil)(n))
            return n;
        if (n === Infinity || n === -Infinity) {
            if (returnInfinity)
                return n;
            throw new Error("cannot apply $" + f.name + " to -inf, value must in (-inf,inf)");
        }
        return f(n);
    };
}
exports.createTrignometryOperator = createTrignometryOperator;


/***/ }),

/***/ 899:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$acos = void 0;
var _internal_1 = __webpack_require__(2409);
/** Returns the inverse cosine (arc cosine) of a value in radians. */
exports.$acos = (0, _internal_1.createTrignometryOperator)(Math.acos);


/***/ }),

/***/ 2140:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$acosh = void 0;
var _internal_1 = __webpack_require__(2409);
/** Returns the inverse hyperbolic cosine (hyperbolic arc cosine) of a value in radians. */
exports.$acosh = (0, _internal_1.createTrignometryOperator)(Math.acosh);


/***/ }),

/***/ 9323:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$asin = void 0;
var _internal_1 = __webpack_require__(2409);
/** Returns the inverse sin (arc sine) of a value in radians. */
exports.$asin = (0, _internal_1.createTrignometryOperator)(Math.asin);


/***/ }),

/***/ 5427:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$asinh = void 0;
var _internal_1 = __webpack_require__(2409);
/** Returns the inverse hyperbolic sine (hyperbolic arc sine) of a value in radians. */
exports.$asinh = (0, _internal_1.createTrignometryOperator)(Math.asinh);


/***/ }),

/***/ 6545:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$atan = void 0;
var _internal_1 = __webpack_require__(2409);
/** Returns the inverse tangent (arc tangent) of a value in radians. */
exports.$atan = (0, _internal_1.createTrignometryOperator)(Math.atan);


/***/ }),

/***/ 8442:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$atan2 = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Returns the inverse tangent (arc tangent) of y / x in radians, where y and x are the first and second values passed to the expression respectively. */
function $atan2(obj, expr, options) {
    var _a = (0, core_1.computeValue)(obj, expr, null, options), y = _a[0], x = _a[1];
    if (isNaN(y) || (0, util_1.isNil)(y))
        return y;
    if (isNaN(x) || (0, util_1.isNil)(x))
        return x;
    return Math.atan2(y, x);
}
exports.$atan2 = $atan2;


/***/ }),

/***/ 372:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$atanh = void 0;
var _internal_1 = __webpack_require__(2409);
/** Returns the inverse hyperbolic tangent (hyperbolic arc tangent) of a value in radians. */
exports.$atanh = (0, _internal_1.createTrignometryOperator)(Math.atanh);


/***/ }),

/***/ 8237:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$cos = void 0;
var _internal_1 = __webpack_require__(2409);
/** Returns the cosine of a value that is measured in radians. */
exports.$cos = (0, _internal_1.createTrignometryOperator)(Math.cos);


/***/ }),

/***/ 4724:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$degreesToRadians = void 0;
var _internal_1 = __webpack_require__(2409);
var RADIANS_FACTOR = Math.PI / 180;
/** Converts a value from degrees to radians. */
exports.$degreesToRadians = (0, _internal_1.createTrignometryOperator)(function (n) { return n * RADIANS_FACTOR; }, true /*returnInfinity*/);


/***/ }),

/***/ 2090:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(899), exports);
__exportStar(__webpack_require__(2140), exports);
__exportStar(__webpack_require__(9323), exports);
__exportStar(__webpack_require__(5427), exports);
__exportStar(__webpack_require__(6545), exports);
__exportStar(__webpack_require__(8442), exports);
__exportStar(__webpack_require__(372), exports);
__exportStar(__webpack_require__(8237), exports);
__exportStar(__webpack_require__(4724), exports);
__exportStar(__webpack_require__(7499), exports);
__exportStar(__webpack_require__(3666), exports);
__exportStar(__webpack_require__(5270), exports);


/***/ }),

/***/ 7499:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$radiansToDegrees = void 0;
var _internal_1 = __webpack_require__(2409);
var DEGREES_FACTOR = 180 / Math.PI;
/** Converts a value from radians to degrees. */
exports.$radiansToDegrees = (0, _internal_1.createTrignometryOperator)(function (n) { return n * DEGREES_FACTOR; }, true /*returnInfinity*/);


/***/ }),

/***/ 3666:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$sin = void 0;
var _internal_1 = __webpack_require__(2409);
/** Returns the sine of a value that is measured in radians. */
exports.$sin = (0, _internal_1.createTrignometryOperator)(Math.sin);


/***/ }),

/***/ 5270:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Trignometry Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#trigonometry-expression-operators
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$tan = void 0;
var _internal_1 = __webpack_require__(2409);
/** Returns the tangent of a value that is measured in radians. */
exports.$tan = (0, _internal_1.createTrignometryOperator)(Math.tan);


/***/ }),

/***/ 7457:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.toInteger = exports.TypeConvertError = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var TypeConvertError = /** @class */ (function (_super) {
    __extends(TypeConvertError, _super);
    function TypeConvertError(message) {
        return _super.call(this, message) || this;
    }
    return TypeConvertError;
}(Error));
exports.TypeConvertError = TypeConvertError;
function toInteger(obj, expr, options, max, min, typename) {
    var val = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(val))
        return null;
    if (val instanceof Date)
        return val.getTime();
    if (val === true)
        return 1;
    if (val === false)
        return 0;
    var n = Number(val);
    if ((0, util_1.isNumber)(n) && n >= min && n <= max) {
        // weirdly a decimal in string format cannot be converted to int.
        // so we must check input if not string or if it is, not in decimal format
        if (!(0, util_1.isString)(val) || n.toString().indexOf(".") === -1) {
            return Math.trunc(n);
        }
    }
    throw new TypeConvertError("cannot convert '" + val + "' to " + typename);
}
exports.toInteger = toInteger;


/***/ }),

/***/ 7291:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$convert = void 0;
var core_1 = __webpack_require__(7424);
var types_1 = __webpack_require__(1463);
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(7457);
var toBool_1 = __webpack_require__(5654);
var toDate_1 = __webpack_require__(1693);
var toDouble_1 = __webpack_require__(5271);
var toInt_1 = __webpack_require__(2284);
var toLong_1 = __webpack_require__(375);
var toString_1 = __webpack_require__(2179);
/**
 * Converts a value to a specified type.
 *
 * @param obj
 * @param expr
 */
function $convert(obj, expr, options) {
    var args = (0, core_1.computeValue)(obj, expr, null, options);
    args.onNull = args.onNull === undefined ? null : args.onNull;
    if ((0, util_1.isNil)(args.input))
        return args.onNull;
    try {
        switch (args.to) {
            case 2:
            case types_1.JsType.STRING:
                return (0, toString_1.$toString)(obj, args.input, options);
            case 8:
            case types_1.JsType.BOOLEAN:
            case types_1.BsonType.BOOL:
                return (0, toBool_1.$toBool)(obj, args.input, options);
            case 9:
            case types_1.JsType.DATE:
                return (0, toDate_1.$toDate)(obj, args.input, options);
            case 1:
            case 19:
            case types_1.BsonType.DOUBLE:
            case types_1.BsonType.DECIMAL:
            case types_1.JsType.NUMBER:
                return (0, toDouble_1.$toDouble)(obj, args.input, options);
            case 16:
            case types_1.BsonType.INT:
                return (0, toInt_1.$toInt)(obj, args.input, options);
            case 18:
            case types_1.BsonType.LONG:
                return (0, toLong_1.$toLong)(obj, args.input, options);
        }
    }
    catch (e) {
        /*nothing to do*/
    }
    if (args.onError !== undefined)
        return args.onError;
    throw new _internal_1.TypeConvertError("could not convert to type " + args.to + ".");
}
exports.$convert = $convert;


/***/ }),

/***/ 2040:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(7291), exports);
__exportStar(__webpack_require__(3416), exports);
__exportStar(__webpack_require__(5654), exports);
__exportStar(__webpack_require__(1693), exports);
__exportStar(__webpack_require__(5507), exports);
__exportStar(__webpack_require__(5271), exports);
__exportStar(__webpack_require__(2284), exports);
__exportStar(__webpack_require__(375), exports);
__exportStar(__webpack_require__(2179), exports);
__exportStar(__webpack_require__(7026), exports);


/***/ }),

/***/ 3416:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$isNumber = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Checks if the specified expression resolves to a numeric value
 *
 * @param obj
 * @param expr
 */
function $isNumber(obj, expr, options) {
    var n = (0, core_1.computeValue)(obj, expr, null, options);
    return (0, util_1.isNumber)(n);
}
exports.$isNumber = $isNumber;


/***/ }),

/***/ 5654:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$toBool = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Converts a value to a boolean.
 *
 * @param obj
 * @param expr
 */
function $toBool(obj, expr, options) {
    var val = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(val))
        return null;
    if ((0, util_1.isString)(val))
        return true;
    return Boolean(val);
}
exports.$toBool = $toBool;


/***/ }),

/***/ 1693:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$toDate = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(7457);
/**
 * Converts a value to a date. If the value cannot be converted to a date, $toDate errors. If the value is null or missing, $toDate returns null.
 *
 * @param obj
 * @param expr
 */
function $toDate(obj, expr, options) {
    var val = (0, core_1.computeValue)(obj, expr, null, options);
    if (val instanceof Date)
        return val;
    if ((0, util_1.isNil)(val))
        return null;
    var d = new Date(val);
    var n = d.getTime();
    if (!isNaN(n))
        return d;
    throw new _internal_1.TypeConvertError("cannot convert '" + val + "' to date");
}
exports.$toDate = $toDate;


/***/ }),

/***/ 5507:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$toDecimal = void 0;
var toDouble_1 = __webpack_require__(5271);
/**
 * Converts a value to a decimal. If the value cannot be converted to a decimal, $toDecimal errors.
 * If the value is null or missing, $toDecimal returns null.
 * This is just an alias for `$toDouble` in this library.
 */
exports.$toDecimal = toDouble_1.$toDouble;


/***/ }),

/***/ 5271:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$toDouble = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(7457);
/**
 * Converts a value to a double. If the value cannot be converted to an double, $toDouble errors. If the value is null or missing, $toDouble returns null.
 *
 * @param obj
 * @param expr
 */
function $toDouble(obj, expr, options) {
    var val = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(val))
        return null;
    if (val instanceof Date)
        return val.getTime();
    if (val === true)
        return 1;
    if (val === false)
        return 0;
    var n = Number(val);
    if ((0, util_1.isNumber)(n))
        return n;
    throw new _internal_1.TypeConvertError("cannot convert '" + val + "' to double/decimal");
}
exports.$toDouble = $toDouble;


/***/ }),

/***/ 2284:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$toInt = void 0;
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(7457);
/**
 * Converts a value to an integer. If the value cannot be converted to an integer, $toInt errors. If the value is null or missing, $toInt returns null.
 * @param obj
 * @param expr
 */
function $toInt(obj, expr, options) {
    return (0, _internal_1.toInteger)(obj, expr, options, util_1.MAX_INT, util_1.MIN_INT, "int");
}
exports.$toInt = $toInt;


/***/ }),

/***/ 375:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$toLong = void 0;
var util_1 = __webpack_require__(6588);
var _internal_1 = __webpack_require__(7457);
/**
 * Converts a value to a long. If the value cannot be converted to a long, $toLong errors. If the value is null or missing, $toLong returns null.
 * @param obj
 * @param expr
 */
function $toLong(obj, expr, options) {
    return (0, _internal_1.toInteger)(obj, expr, options, util_1.MAX_LONG, util_1.MIN_LONG, "long");
}
exports.$toLong = $toLong;


/***/ }),

/***/ 2179:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$toString = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var date_1 = __webpack_require__(5832);
function $toString(obj, expr, options) {
    var val = (0, core_1.computeValue)(obj, expr, null, options);
    if ((0, util_1.isNil)(val))
        return null;
    if (val instanceof Date) {
        var dateExpr = {
            date: expr,
            format: "%Y-%m-%dT%H:%M:%S.%LZ",
        };
        return (0, date_1.$dateToString)(obj, dateExpr, options);
    }
    else {
        return val.toString();
    }
}
exports.$toString = $toString;


/***/ }),

/***/ 7026:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * Type Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#type-expression-operators
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$type = void 0;
var core_1 = __webpack_require__(7424);
var types_1 = __webpack_require__(1463);
var util_1 = __webpack_require__(6588);
function $type(obj, expr, options) {
    var val = (0, core_1.computeValue)(obj, expr, null, options);
    var typename = (0, util_1.getType)(val);
    var nativeType = typename.toLowerCase();
    switch (nativeType) {
        case types_1.JsType.BOOLEAN:
            return types_1.BsonType.BOOL;
        case types_1.JsType.NUMBER:
            if (val.toString().indexOf(".") >= 0)
                return types_1.BsonType.DOUBLE;
            return val >= util_1.MIN_INT && val <= util_1.MAX_INT ? types_1.BsonType.INT : types_1.BsonType.LONG;
        case types_1.JsType.REGEXP:
            return types_1.BsonType.REGEX;
        default:
            return nativeType;
    }
}
exports.$type = $type;


/***/ }),

/***/ 6752:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(3794), exports);


/***/ }),

/***/ 3794:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * Variable Expression Operators: https://docs.mongodb.com/manual/reference/operator/aggregation/#variable-expression-operators
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$let = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Defines variables for use within the scope of a sub-expression and returns the result of the sub-expression.
 *
 * @param obj The target object for this expression
 * @param expr The right-hand side of the operator
 * @param options Options to use for this operattion
 * @returns {*}
 */
function $let(obj, expr, options) {
    // resolve vars
    var vars = {};
    for (var _i = 0, _a = Object.entries(expr.vars); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], val = _b[1];
        vars["$" + key] = (0, core_1.computeValue)(obj, val, null, options);
    }
    return (0, core_1.computeValue)(__assign({ obj: obj }, vars), expr.in, null, options);
}
exports.$let = $let;


/***/ }),

/***/ 5292:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$addFields = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Adds new fields to documents.
 * Outputs documents that contain all existing fields from the input documents and newly added fields.
 *
 * @param {Iterator} collection
 * @param {Object} expr
 * @param {Options} options
 */
function $addFields(collection, expr, options) {
    var newFields = Object.keys(expr);
    if (newFields.length === 0)
        return collection;
    return collection.map(function (obj) {
        var newObj = __assign({}, obj);
        for (var _i = 0, newFields_1 = newFields; _i < newFields_1.length; _i++) {
            var field = newFields_1[_i];
            var newValue = (0, core_1.computeValue)(obj, expr[field], null, options);
            if (newValue !== undefined) {
                (0, util_1.setValue)(newObj, field, newValue);
            }
            else {
                (0, util_1.removeValue)(newObj, field);
            }
        }
        return newObj;
    });
}
exports.$addFields = $addFields;


/***/ }),

/***/ 624:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$bucket = void 0;
var core_1 = __webpack_require__(7424);
var lazy_1 = __webpack_require__(1088);
var util_1 = __webpack_require__(6588);
/**
 * Categorizes incoming documents into groups, called buckets, based on a specified expression and bucket boundaries.
 * https://docs.mongodb.com/manual/reference/operator/aggregation/bucket/
 *
 * @param {*} collection
 * @param {*} expr
 * @param {Options} opt Pipeline options
 */
function $bucket(collection, expr, options) {
    var boundaries = __spreadArray([], expr.boundaries, true);
    var defaultKey = expr.default;
    var lower = boundaries[0]; // inclusive
    var upper = boundaries[boundaries.length - 1]; // exclusive
    var outputExpr = expr.output || { count: { $sum: 1 } };
    (0, util_1.assert)(expr.boundaries.length > 2, "$bucket 'boundaries' expression must have at least 3 elements");
    var boundType = (0, util_1.getType)(lower);
    for (var i = 0, len = boundaries.length - 1; i < len; i++) {
        (0, util_1.assert)(boundType === (0, util_1.getType)(boundaries[i + 1]), "$bucket 'boundaries' must all be of the same type");
        (0, util_1.assert)(boundaries[i] < boundaries[i + 1], "$bucket 'boundaries' must be sorted in ascending order");
    }
    !(0, util_1.isNil)(defaultKey) &&
        (0, util_1.getType)(expr.default) === (0, util_1.getType)(lower) &&
        (0, util_1.assert)(expr.default >= upper || expr.default < lower, "$bucket 'default' expression must be out of boundaries range");
    var grouped = {};
    for (var _i = 0, boundaries_1 = boundaries; _i < boundaries_1.length; _i++) {
        var k = boundaries_1[_i];
        grouped[k] = [];
    }
    // add default key if provided
    if (!(0, util_1.isNil)(defaultKey))
        grouped[defaultKey] = [];
    var iterator = null;
    return (0, lazy_1.Lazy)(function () {
        if (iterator === null) {
            collection.each(function (obj) {
                var key = (0, core_1.computeValue)(obj, expr.groupBy, null, options);
                if ((0, util_1.isNil)(key) || key < lower || key >= upper) {
                    (0, util_1.assert)(!(0, util_1.isNil)(defaultKey), "$bucket require a default for out of range values");
                    grouped[defaultKey].push(obj);
                }
                else {
                    (0, util_1.assert)(key >= lower && key < upper, "$bucket 'groupBy' expression must resolve to a value in range of boundaries");
                    var index = findInsertIndex(boundaries, key);
                    var boundKey = boundaries[Math.max(0, index - 1)];
                    grouped[boundKey].push(obj);
                }
            });
            // upper bound is exclusive so we remove it
            boundaries.pop();
            if (!(0, util_1.isNil)(defaultKey))
                boundaries.push(defaultKey);
            iterator = (0, lazy_1.Lazy)(boundaries).map(function (key) {
                var acc = (0, core_1.computeValue)(grouped[key], outputExpr, null, options);
                return (0, util_1.into)(acc, { _id: key });
            });
        }
        return iterator.next();
    });
}
exports.$bucket = $bucket;
/**
 * Find the insert index for the given key in a sorted array.
 *
 * @param {*} sorted The sorted array to search
 * @param {*} item The search key
 */
function findInsertIndex(sorted, item) {
    // uses binary search
    var lo = 0;
    var hi = sorted.length - 1;
    while (lo <= hi) {
        var mid = Math.round(lo + (hi - lo) / 2);
        if (item < sorted[mid]) {
            hi = mid - 1;
        }
        else if (item > sorted[mid]) {
            lo = mid + 1;
        }
        else {
            return mid;
        }
    }
    return lo;
}


/***/ }),

/***/ 4943:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$bucketAuto = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Categorizes incoming documents into a specific number of groups, called buckets,
 * based on a specified expression. Bucket boundaries are automatically determined
 * in an attempt to evenly distribute the documents into the specified number of buckets.
 * https://docs.mongodb.com/manual/reference/operator/aggregation/bucketAuto/
 *
 * @param {*} collection
 * @param {*} expr
 * @param {*} options
 */
function $bucketAuto(collection, expr, options) {
    var outputExpr = expr.output || { count: { $sum: 1 } };
    var groupByExpr = expr.groupBy;
    var bucketCount = expr.buckets;
    (0, util_1.assert)(bucketCount > 0, "The $bucketAuto 'buckets' field must be greater than 0, but found: " + bucketCount);
    var ID_KEY = "_id";
    return collection.transform(function (coll) {
        var approxBucketSize = Math.max(1, Math.round(coll.length / bucketCount));
        var computeValueOptimized = (0, util_1.memoize)(core_1.computeValue, options === null || options === void 0 ? void 0 : options.hashFunction);
        var grouped = {};
        var remaining = [];
        var sorted = (0, util_1.sortBy)(coll, function (o) {
            var key = computeValueOptimized(o, groupByExpr, null, options);
            if ((0, util_1.isNil)(key)) {
                remaining.push(o);
            }
            else {
                grouped[key] || (grouped[key] = []);
                grouped[key].push(o);
            }
            return key;
        });
        var result = [];
        var index = 0; // counter for sorted collection
        for (var i = 0, len = sorted.length; i < bucketCount && index < len; i++) {
            var boundaries = {};
            var bucketItems = [];
            for (var j = 0; j < approxBucketSize && index < len; j++) {
                var key = computeValueOptimized(sorted[index], groupByExpr, null, options);
                if ((0, util_1.isNil)(key))
                    key = null;
                // populate current bucket with all values for current key
                (0, util_1.into)(bucketItems, (0, util_1.isNil)(key) ? remaining : grouped[key]);
                // increase sort index by number of items added
                index += (0, util_1.isNil)(key) ? remaining.length : grouped[key].length;
                // set the min key boundary if not already present
                if (!(0, util_1.has)(boundaries, "min"))
                    boundaries.min = key;
                if (result.length > 0) {
                    var lastBucket = result[result.length - 1];
                    lastBucket[ID_KEY].max = boundaries.min;
                }
            }
            // if is last bucket add remaining items
            if (i == bucketCount - 1) {
                (0, util_1.into)(bucketItems, sorted.slice(index));
            }
            var values = (0, core_1.computeValue)(bucketItems, outputExpr, null, options);
            result.push((0, util_1.into)(values, {
                _id: boundaries,
            }));
        }
        if (result.length > 0) {
            result[result.length - 1][ID_KEY].max =
                computeValueOptimized(sorted[sorted.length - 1], groupByExpr, null, options);
        }
        return result;
    });
}
exports.$bucketAuto = $bucketAuto;


/***/ }),

/***/ 1688:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$count = void 0;
var lazy_1 = __webpack_require__(1088);
var util_1 = __webpack_require__(6588);
/**
 * Returns a document that contains a count of the number of documents input to the stage.
 *
 * @param {Array} collection
 * @param {String} expr
 * @param {Options} options
 * @return {Object}
 */
function $count(collection, expr, options) {
    var _a;
    (0, util_1.assert)((0, util_1.isString)(expr) &&
        expr.trim() !== "" &&
        expr.indexOf(".") === -1 &&
        expr.trim()[0] !== "$", "Invalid expression value for $count");
    return (0, lazy_1.Lazy)([
        (_a = {},
            _a[expr] = collection.size(),
            _a),
    ]);
}
exports.$count = $count;


/***/ }),

/***/ 1129:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$facet = void 0;
var aggregator_1 = __webpack_require__(8221);
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Processes multiple aggregation pipelines within a single stage on the same set of input documents.
 * Enables the creation of multi-faceted aggregations capable of characterizing data across multiple dimensions, or facets, in a single stage.
 */
function $facet(collection, expr, options) {
    return collection.transform(function (array) {
        return [
            (0, util_1.objectMap)(expr, function (pipeline) {
                return new aggregator_1.Aggregator(pipeline, __assign(__assign({}, options), { processingMode: core_1.ProcessingMode.CLONE_INPUT })).run(array);
            }),
        ];
    });
}
exports.$facet = $facet;


/***/ }),

/***/ 4285:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$group = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Groups documents together for the purpose of calculating aggregate values based on a collection of documents.
 *
 * @param collection
 * @param expr
 * @param options
 * @returns {Array}
 */
function $group(collection, expr, options) {
    // lookup key for grouping
    var ID_KEY = "_id";
    var id = expr[ID_KEY];
    return collection.transform(function (coll) {
        var partitions = (0, util_1.groupBy)(coll, function (obj) { return (0, core_1.computeValue)(obj, id, null, options); }, options === null || options === void 0 ? void 0 : options.hashFunction);
        // remove the group key
        expr = __assign({}, expr);
        delete expr[ID_KEY];
        var i = -1;
        var size = partitions.keys.length;
        return function () {
            if (++i === size)
                return { done: true };
            var groupId = partitions.keys[i];
            var obj = {};
            // exclude undefined key value
            if (groupId !== undefined) {
                obj[ID_KEY] = groupId;
            }
            // compute remaining keys in expression
            for (var _i = 0, _a = Object.entries(expr); _i < _a.length; _i++) {
                var _b = _a[_i], key = _b[0], val = _b[1];
                obj[key] = (0, core_1.computeValue)(partitions.groups[i], val, key, __assign({ groupId: groupId }, options));
            }
            return { value: obj, done: false };
        };
    });
}
exports.$group = $group;


/***/ }),

/***/ 1091:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * Pipeline Aggregation Stages. https://docs.mongodb.com/manual/reference/operator/aggregation-
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(5292), exports);
__exportStar(__webpack_require__(624), exports);
__exportStar(__webpack_require__(4943), exports);
__exportStar(__webpack_require__(1688), exports);
__exportStar(__webpack_require__(1129), exports);
__exportStar(__webpack_require__(4285), exports);
__exportStar(__webpack_require__(854), exports);
__exportStar(__webpack_require__(7672), exports);
__exportStar(__webpack_require__(7533), exports);
__exportStar(__webpack_require__(7391), exports);
__exportStar(__webpack_require__(2250), exports);
__exportStar(__webpack_require__(8203), exports);
__exportStar(__webpack_require__(1229), exports);
__exportStar(__webpack_require__(9251), exports);
__exportStar(__webpack_require__(3042), exports);
__exportStar(__webpack_require__(6486), exports);
__exportStar(__webpack_require__(5702), exports);
__exportStar(__webpack_require__(2702), exports);
__exportStar(__webpack_require__(7642), exports);
__exportStar(__webpack_require__(3469), exports);
__exportStar(__webpack_require__(8734), exports);
__exportStar(__webpack_require__(5609), exports);
__exportStar(__webpack_require__(49), exports);
__exportStar(__webpack_require__(8105), exports);


/***/ }),

/***/ 854:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$limit = void 0;
/**
 * Restricts the number of documents in an aggregation pipeline.
 *
 * @param collection
 * @param value
 * @param options
 * @returns {Object|*}
 */
function $limit(collection, expr, options) {
    return collection.take(expr);
}
exports.$limit = $limit;


/***/ }),

/***/ 7672:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$lookup = void 0;
var util_1 = __webpack_require__(6588);
/**
 * Performs a left outer join to another collection in the same database to filter in documents from the “joined” collection for processing.
 *
 * @param collection
 * @param expr
 * @param opt
 */
function $lookup(collection, expr, options) {
    var joinColl = (0, util_1.isString)(expr.from)
        ? options === null || options === void 0 ? void 0 : options.collectionResolver(expr.from)
        : expr.from;
    (0, util_1.assert)(joinColl instanceof Array, "'from' field must resolve to an array");
    var hash = {};
    for (var _i = 0, joinColl_1 = joinColl; _i < joinColl_1.length; _i++) {
        var obj = joinColl_1[_i];
        var k = (0, util_1.hashCode)((0, util_1.resolve)(obj, expr.foreignField), options === null || options === void 0 ? void 0 : options.hashFunction);
        hash[k] = hash[k] || [];
        hash[k].push(obj);
    }
    return collection.map(function (obj) {
        var k = (0, util_1.hashCode)((0, util_1.resolve)(obj, expr.localField), options === null || options === void 0 ? void 0 : options.hashFunction);
        var newObj = (0, util_1.into)({}, obj);
        newObj[expr.as] = hash[k] || [];
        return newObj;
    });
}
exports.$lookup = $lookup;


/***/ }),

/***/ 7533:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$match = void 0;
var query_1 = __webpack_require__(7732);
/**
 * Filters the document stream, and only allows matching documents to pass into the next pipeline stage.
 * $match uses standard MongoDB queries.
 *
 * @param collection
 * @param expr
 * @param options
 * @returns {Array|*}
 */
function $match(collection, expr, options) {
    var q = new query_1.Query(expr, options);
    return collection.filter(function (o) { return q.test(o); });
}
exports.$match = $match;


/***/ }),

/***/ 7391:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$merge = void 0;
var aggregator_1 = __webpack_require__(8221);
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
var accumulator_1 = __webpack_require__(1998);
/**
 * Writes the resulting documents of the aggregation pipeline to a collection.
 *
 * The stage can incorporate (insert new documents, merge documents, replace documents,
 * keep existing documents, fail the operation, process documents with a custom update pipeline)
 * the results into an output collection. To use the $merge stage, it must be the last stage in the pipeline.
 *
 * Note: Object are deep cloned for outputing regardless of the ProcessingMode.
 *
 * @param collection
 * @param expr
 * @param options
 * @returns {*}
 */
function $merge(collection, expr, options) {
    var output = (0, util_1.isString)(expr.into)
        ? options === null || options === void 0 ? void 0 : options.collectionResolver(expr.into)
        : expr.into;
    (0, util_1.assert)(output instanceof Array, "$merge: option 'into' must resolve to an array");
    var onField = expr.on || options.idKey;
    var getHash = function (o) {
        var val = (0, util_1.isString)(onField)
            ? (0, util_1.resolve)(o, onField)
            : onField.map(function (s) { return (0, util_1.resolve)(o, s); });
        return (0, util_1.hashCode)(val, options.hashFunction);
    };
    var hash = {};
    // we assuming the lookup expressions are unique
    for (var i = 0; i < output.length; i++) {
        var obj = output[i];
        var k = getHash(obj);
        (0, util_1.assert)(!hash[k], "$merge: 'into' collection must have unique entries for the 'on' field.");
        hash[k] = [obj, i];
    }
    return collection.map(function (o) {
        var k = getHash(o);
        if (hash[k]) {
            var _a = hash[k], target = _a[0], i = _a[1];
            if ((0, util_1.isArray)(expr.whenMatched)) {
                var vars = expr.let
                    ? (0, core_1.computeValue)(target, expr.let, null, options)
                    : {};
                var newObj = {};
                try {
                    var aggregator = new aggregator_1.Aggregator(expr.whenMatched, options);
                    target["$new"] = o;
                    for (var _i = 0, _b = Object.entries(vars); _i < _b.length; _i++) {
                        var _c = _b[_i], name_1 = _c[0], val = _c[1];
                        target["$" + name_1] = val;
                    }
                    Object.assign(newObj, aggregator.run([target])[0]);
                }
                finally {
                    delete newObj["$new"];
                    for (var _d = 0, _e = Object.keys(vars); _d < _e.length; _d++) {
                        var name_2 = _e[_d];
                        delete newObj["$" + name_2];
                    }
                }
                output[i] = newObj;
            }
            else {
                switch (expr.whenMatched) {
                    case "replace":
                        output[i] = o;
                        break;
                    case "fail":
                        throw new Error("$merge: failed due to matching as specified by 'whenMatched' option.");
                    case "keepExisting":
                        break;
                    case "merge":
                    default:
                        output[i] = (0, accumulator_1.$mergeObjects)(o, [target, o], options);
                        break;
                }
            }
        }
        else {
            switch (expr.whenNotMatched) {
                case "discard":
                    break;
                case "fail":
                    throw new Error("$merge: failed due to matching as specified by 'whenMatched' option.");
                case "insert":
                default:
                    output.push(o);
                    break;
            }
        }
        return o; // passthrough
    });
}
exports.$merge = $merge;


/***/ }),

/***/ 2250:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$out = void 0;
var util_1 = __webpack_require__(6588);
/**
 * Takes the documents returned by the aggregation pipeline and writes them to a specified collection.
 *
 * Unlike the $out operator in MongoDB, this operator can appear in any position in the pipeline and is
 * useful for collecting intermediate results of an aggregation operation.
 *
 * Note: Object are deep cloned for outputing regardless of the ProcessingMode.
 *
 * @param collection
 * @param expr
 * @param options
 * @returns {*}
 */
function $out(collection, expr, options) {
    var outputColl = (0, util_1.isString)(expr)
        ? options === null || options === void 0 ? void 0 : options.collectionResolver(expr)
        : expr;
    (0, util_1.assert)(outputColl instanceof Array, "expression must resolve to an array");
    return collection.map(function (o) {
        outputColl.push((0, util_1.cloneDeep)(o));
        return o; // passthrough
    });
}
exports.$out = $out;


/***/ }),

/***/ 8203:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$project = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Reshapes a document stream.
 * $project can rename, add, or remove fields as well as create computed values and sub-documents.
 *
 * @param collection
 * @param expr
 * @param opt
 * @returns {Array}
 */
function $project(collection, expr, options) {
    if ((0, util_1.isEmpty)(expr))
        return collection;
    // result collection
    var expressionKeys = Object.keys(expr);
    var idOnlyExcluded = false;
    // validate inclusion and exclusion
    validateExpression(expr, options);
    var ID_KEY = options.idKey;
    if ((0, util_1.inArray)(expressionKeys, ID_KEY)) {
        var id = expr[ID_KEY];
        if (id === 0 || id === false) {
            expressionKeys = expressionKeys.filter(util_1.notInArray.bind(null, [ID_KEY]));
            idOnlyExcluded = expressionKeys.length == 0;
        }
    }
    else {
        // if not specified the add the ID field
        expressionKeys.push(ID_KEY);
    }
    return collection.map(function (obj) {
        return processObject(obj, expr, options, expressionKeys, idOnlyExcluded);
    });
}
exports.$project = $project;
/**
 * Process the expression value for $project operators
 *
 * @param {Object} obj The object to use as options
 * @param {Object} expr The experssion object of $project operator
 * @param {Array} expressionKeys The key in the 'expr' object
 * @param {Boolean} idOnlyExcluded Boolean value indicating whether only the ID key is excluded
 */
function processObject(obj, expr, options, expressionKeys, idOnlyExcluded) {
    var newObj = {};
    var foundSlice = false;
    var foundExclusion = false;
    var dropKeys = [];
    if (idOnlyExcluded) {
        dropKeys.push(options.idKey);
    }
    var _loop_1 = function (key) {
        // final computed value of the key
        var value = undefined;
        // expression to associate with key
        var subExpr = expr[key];
        if (key !== options.idKey && (0, util_1.inArray)([0, false], subExpr)) {
            foundExclusion = true;
        }
        if (key === options.idKey && (0, util_1.isEmpty)(subExpr)) {
            // tiny optimization here to skip over id
            value = obj[key];
        }
        else if ((0, util_1.isString)(subExpr)) {
            value = (0, core_1.computeValue)(obj, subExpr, key, options);
        }
        else if ((0, util_1.inArray)([1, true], subExpr)) {
            // For direct projections, we use the resolved object value
        }
        else if (subExpr instanceof Array) {
            value = subExpr.map(function (v) {
                var r = (0, core_1.computeValue)(obj, v, null, options);
                if ((0, util_1.isNil)(r))
                    return null;
                return r;
            });
        }
        else if ((0, util_1.isObject)(subExpr)) {
            var subExprObj_1 = subExpr;
            var subExprKeys_1 = Object.keys(subExpr);
            var operator = subExprKeys_1.length == 1 ? subExprKeys_1[0] : null;
            // first try a projection operator
            var call = (0, core_1.getOperator)(core_1.OperatorType.PROJECTION, operator);
            if (call) {
                // apply the projection operator on the operator expression for the key
                if (operator === "$slice") {
                    // $slice is handled differently for aggregation and projection operations
                    if ((0, util_1.ensureArray)(subExprObj_1[operator]).every(util_1.isNumber)) {
                        // $slice for projection operation
                        value = call(obj, subExprObj_1[operator], key);
                        foundSlice = true;
                    }
                    else {
                        // $slice for aggregation operation
                        value = (0, core_1.computeValue)(obj, subExprObj_1, key, options);
                    }
                }
                else {
                    value = call(obj, subExprObj_1[operator], key, options);
                }
            }
            else if ((0, util_1.isOperator)(operator)) {
                // compute if operator key
                value = (0, core_1.computeValue)(obj, subExprObj_1[operator], operator, options);
            }
            else if ((0, util_1.has)(obj, key)) {
                // compute the value for the sub expression for the key
                validateExpression(subExprObj_1, options);
                var target = obj[key];
                if (target instanceof Array) {
                    value = target.map(function (o) {
                        return processObject(o, subExprObj_1, options, subExprKeys_1, false);
                    });
                }
                else {
                    target = (0, util_1.isObject)(target) ? target : obj;
                    value = processObject(target, subExprObj_1, options, subExprKeys_1, false);
                }
            }
            else {
                // compute the value for the sub expression for the key
                value = (0, core_1.computeValue)(obj, subExpr, null, options);
            }
        }
        else {
            dropKeys.push(key);
            return "continue";
        }
        // get value with object graph
        var objPathGraph = (0, util_1.resolveGraph)(obj, key, {
            preserveMissing: true,
        });
        // add the value at the path
        if (objPathGraph !== undefined) {
            (0, util_1.merge)(newObj, objPathGraph, {
                flatten: true,
            });
        }
        // if computed add/or remove accordingly
        if ((0, util_1.notInArray)([0, 1, false, true], subExpr)) {
            if (value === undefined) {
                (0, util_1.removeValue)(newObj, key, { descendArray: true });
            }
            else {
                (0, util_1.setValue)(newObj, key, value);
            }
        }
    };
    for (var _i = 0, expressionKeys_1 = expressionKeys; _i < expressionKeys_1.length; _i++) {
        var key = expressionKeys_1[_i];
        _loop_1(key);
    }
    // filter out all missing values preserved to support correct merging
    (0, util_1.filterMissing)(newObj);
    // For the following cases we include all keys on the object that were not explicitly excluded.
    //
    // 1. projection included $slice operator
    // 2. some fields were explicitly excluded
    // 3. only the id field was excluded
    if (foundSlice || foundExclusion || idOnlyExcluded) {
        newObj = (0, util_1.into)({}, obj, newObj);
        if (dropKeys.length > 0) {
            for (var _a = 0, dropKeys_1 = dropKeys; _a < dropKeys_1.length; _a++) {
                var k = dropKeys_1[_a];
                (0, util_1.removeValue)(newObj, k, { descendArray: true });
            }
        }
    }
    return newObj;
}
/**
 * Validate inclusion and exclusion values in expression
 *
 * @param {Object} expr The expression given for the projection
 */
function validateExpression(expr, options) {
    var check = [false, false];
    for (var _i = 0, _a = Object.entries(expr); _i < _a.length; _i++) {
        var _b = _a[_i], k = _b[0], v = _b[1];
        if (k === options.idKey)
            return;
        if (v === 0 || v === false) {
            check[0] = true;
        }
        else if (v === 1 || v === true) {
            check[1] = true;
        }
        (0, util_1.assert)(!(check[0] && check[1]), "Projection cannot have a mix of inclusion and exclusion.");
    }
}


/***/ }),

/***/ 1229:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$redact = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Restricts the contents of the documents based on information stored in the documents themselves.
 *
 * https://docs.mongodb.com/manual/reference/operator/aggregation/redact/
 */
function $redact(collection, expr, options) {
    return collection.map(function (obj) { return (0, core_1.redact)(obj, expr, options); });
}
exports.$redact = $redact;


/***/ }),

/***/ 9251:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$replaceRoot = void 0;
var core_1 = __webpack_require__(7424);
var util_1 = __webpack_require__(6588);
/**
 * Replaces a document with the specified embedded document or new one.
 * The replacement document can be any valid expression that resolves to a document.
 *
 * https://docs.mongodb.com/manual/reference/operator/aggregation/replaceRoot/
 *
 * @param  {Iterator} collection
 * @param  {Object} expr
 * @param  {Object} options
 * @return {*}
 */
function $replaceRoot(collection, expr, options) {
    return collection.map(function (obj) {
        obj = (0, core_1.computeValue)(obj, expr.newRoot, null, options);
        (0, util_1.assert)((0, util_1.isObject)(obj), "$replaceRoot expression must return an object");
        return obj;
    });
}
exports.$replaceRoot = $replaceRoot;


/***/ }),

/***/ 3042:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$replaceWith = void 0;
var replaceRoot_1 = __webpack_require__(9251);
/**
 * Alias for $replaceRoot
 */
exports.$replaceWith = replaceRoot_1.$replaceRoot;


/***/ }),

/***/ 6486:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// $sample operator -  https://docs.mongodb.com/manual/reference/operator/aggregation/sample/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$sample = void 0;
/**
 * Randomly selects the specified number of documents from its input. The given iterator must have finite values
 *
 * @param  {Iterator} collection
 * @param  {Object} expr
 * @param  {Options} options
 * @return {*}
 */
function $sample(collection, expr, options) {
    return collection.transform(function (xs) {
        var len = xs.length;
        var i = -1;
        return function () {
            if (++i === expr.size)
                return { done: true };
            var n = Math.floor(Math.random() * len);
            return { value: xs[n], done: false };
        };
    });
}
exports.$sample = $sample;


/***/ }),

/***/ 5702:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$set = void 0;
var addFields_1 = __webpack_require__(5292);
/**
 * Alias for $addFields.
 */
exports.$set = addFields_1.$addFields;


/***/ }),

/***/ 2702:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// $setWindowFields -  https://docs.mongodb.com/manual/reference/operator/aggregation/setWindowFields/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$setWindowFields = void 0;
var core_1 = __webpack_require__(7424);
var lazy_1 = __webpack_require__(1088);
var util_1 = __webpack_require__(6588);
var expression_1 = __webpack_require__(6234);
var _1 = __webpack_require__(1091);
/**
 * Randomly selects the specified number of documents from its input. The given iterator must have finite values
 *
 * @param  {Iterator} collection
 * @param  {Object} expr
 * @param  {Options} options
 * @return {*}
 */
function $setWindowFields(collection, expr, options) {
    // validate inputs early since this can be an expensive operation.
    for (var _i = 0, _a = Object.values(expr.output); _i < _a.length; _i++) {
        var outputExpr = _a[_i];
        var keys = Object.keys(outputExpr);
        var op = keys.find(util_1.isOperator);
        (0, util_1.assert)(!!(0, core_1.getOperator)(core_1.OperatorType.WINDOW, op) ||
            !!(0, core_1.getOperator)(core_1.OperatorType.ACCUMULATOR, op), op + " is not a valid window operator");
        (0, util_1.assert)(keys.length > 0 &&
            keys.length <= 2 &&
            (keys.length == 1 || keys.includes("window")), "$setWindowFields 'output' values should have a single window operator.");
        if (outputExpr === null || outputExpr === void 0 ? void 0 : outputExpr.window) {
            var _b = outputExpr.window, documents = _b.documents, range = _b.range;
            (0, util_1.assert)((!!documents && !range) ||
                (!documents && !!range) ||
                (!documents && !range), "$setWindowFields 'output.window' option supports only one of 'documents' or 'range'.");
        }
    }
    // we sort first if required
    if (expr.sortBy) {
        collection = (0, _1.$sort)(collection, expr.sortBy, options);
    }
    // then partition collection
    if (expr.partitionBy) {
        collection = (0, _1.$group)(collection, {
            _id: expr.partitionBy,
            items: { $push: "$$CURRENT" },
        }, options);
    }
    else {
        // single partition so we can keep the code uniform
        collection = (0, lazy_1.Lazy)([
            {
                _id: 0,
                items: collection.value(),
            },
        ]);
    }
    // transform values
    return collection.transform(function (partitions) {
        // let iteratorIndex = 0;
        var iterators = [];
        var outputConfig = [];
        for (var _i = 0, _a = Object.entries(expr.output); _i < _a.length; _i++) {
            var _b = _a[_i], field = _b[0], outputExpr = _b[1];
            var operatorName = Object.keys(outputExpr).find(util_1.isOperator);
            outputConfig.push({
                operatorName: operatorName,
                func: {
                    left: (0, core_1.getOperator)(core_1.OperatorType.ACCUMULATOR, operatorName),
                    right: (0, core_1.getOperator)(core_1.OperatorType.WINDOW, operatorName),
                },
                args: outputExpr[operatorName],
                field: field,
                window: outputExpr.window,
            });
        }
        // each parition maintains its own closure to process the documents in the window.
        partitions.forEach(function (group) {
            // get the items to process
            var items = group.items;
            // create an iterator per group.
            // we need the index of each document so we track it using a special field.
            var iterator = (0, lazy_1.Lazy)(items);
            // results map
            var windowResultMap = {};
            var _loop_1 = function (config) {
                var _a;
                var func = config.func, args = config.args, field = config.field, window_1 = config.window;
                var makeResultFunc = function (getItemsFn) {
                    // closure for object index within the partition
                    var index = -1;
                    return function (obj) {
                        ++index;
                        // process accumulator function
                        if (func.left) {
                            return func.left(getItemsFn(obj, index), args, options);
                        }
                        // OR process window function
                        return func.right(obj, getItemsFn(obj, index), {
                            parentExpr: expr,
                            inputExpr: args,
                            documentNumber: index + 1,
                            field: field,
                        }, options);
                    };
                };
                if (window_1) {
                    var documents_1 = window_1.documents, range = window_1.range, unit_1 = window_1.unit;
                    var boundary_1 = documents_1 || range;
                    var begin_1 = boundary_1[0];
                    var end_1 = boundary_1[1];
                    if (boundary_1 && (begin_1 != "unbounded" || end_1 != "unbounded")) {
                        var toBeginIndex_1 = function (currentIndex) {
                            if (begin_1 == "current")
                                return currentIndex;
                            if (begin_1 == "unbounded")
                                return 0;
                            return Math.max(begin_1 + currentIndex, 0);
                        };
                        var toEndIndex_1 = function (currentIndex) {
                            if (end_1 == "current")
                                return currentIndex + 1;
                            if (end_1 == "unbounded")
                                return items.length;
                            return end_1 + currentIndex + 1;
                        };
                        var getItems = function (current, index) {
                            // handle string boundaries or documents
                            if (!!documents_1 || boundary_1.every(util_1.isString)) {
                                return items.slice(toBeginIndex_1(index), toEndIndex_1(index));
                            }
                            // handle range with numeric boundary values
                            var sortKey = Object.keys(expr.sortBy)[0];
                            var lower;
                            var upper;
                            if (unit_1) {
                                // we are dealing with datetimes
                                var getTime = function (amount) {
                                    return (0, expression_1.$dateAdd)(current, {
                                        startDate: new Date(current[sortKey]),
                                        unit: unit_1,
                                        amount: amount,
                                    }).getTime();
                                };
                                lower = (0, util_1.isNumber)(begin_1) ? getTime(begin_1) : -Infinity;
                                upper = (0, util_1.isNumber)(end_1) ? getTime(end_1) : Infinity;
                            }
                            else {
                                var currentValue = current[sortKey];
                                lower = (0, util_1.isNumber)(begin_1) ? currentValue + begin_1 : -Infinity;
                                upper = (0, util_1.isNumber)(end_1) ? currentValue + end_1 : Infinity;
                            }
                            var array = items;
                            if (begin_1 == "current")
                                array = items.slice(index);
                            if (end_1 == "current")
                                array = items.slice(0, index + 1);
                            // look within the boundary and filter down
                            return array.filter(function (o) {
                                var value = o[sortKey];
                                var n = +value;
                                return n >= lower && n <= upper;
                            });
                        };
                        windowResultMap[field] = makeResultFunc(getItems);
                    }
                }
                // default action is to utilize the entire set of items
                if (!windowResultMap[field]) {
                    windowResultMap[field] = makeResultFunc(function (_) { return items; });
                }
                // invoke add fields to get the desired behaviour using a custom function.
                iterator = (0, _1.$addFields)(iterator, (_a = {},
                    _a[field] = {
                        $function: {
                            body: function (obj) { return windowResultMap[field](obj); },
                            args: ["$$CURRENT"],
                        },
                    },
                    _a));
            };
            for (var _i = 0, outputConfig_1 = outputConfig; _i < outputConfig_1.length; _i++) {
                var config = outputConfig_1[_i];
                _loop_1(config);
            }
            // add to iterator list
            iterators.push(iterator);
        });
        return lazy_1.compose.apply(void 0, iterators);
    });
}
exports.$setWindowFields = $setWindowFields;


/***/ }),

/***/ 7642:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$skip = void 0;
/**
 * Skips over a specified number of documents from the pipeline and returns the rest.
 *
 * @param collection An iterator
 * @param expr
 * @param  {Options} options
 * @returns {*}
 */
function $skip(collection, expr, options) {
    return collection.drop(expr);
}
exports.$skip = $skip;


/***/ }),

/***/ 3469:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$sort = void 0;
var util_1 = __webpack_require__(6588);
/**
 * Takes all input documents and returns them in a stream of sorted documents.
 *
 * @param collection
 * @param sortKeys
 * @param  {Object} options
 * @returns {*}
 */
function $sort(collection, sortKeys, options) {
    if ((0, util_1.isEmpty)(sortKeys) || !(0, util_1.isObject)(sortKeys))
        return collection;
    var cmp = util_1.compare;
    // check for collation spec on the options
    var collationSpec = options.collation;
    // use collation comparator if provided
    if ((0, util_1.isObject)(collationSpec) && (0, util_1.isString)(collationSpec.locale)) {
        cmp = collationComparator(collationSpec);
    }
    return collection.transform(function (coll) {
        var modifiers = Object.keys(sortKeys);
        var _loop_1 = function (key) {
            var grouped = (0, util_1.groupBy)(coll, function (obj) { return (0, util_1.resolve)(obj, key); }, options === null || options === void 0 ? void 0 : options.hashFunction);
            var sortedIndex = {};
            var indexKeys = (0, util_1.sortBy)(grouped.keys, function (k, i) {
                sortedIndex[k] = i;
                return k;
            }, cmp);
            if (sortKeys[key] === -1)
                indexKeys.reverse();
            coll = [];
            for (var _b = 0, indexKeys_1 = indexKeys; _b < indexKeys_1.length; _b++) {
                var k = indexKeys_1[_b];
                (0, util_1.into)(coll, grouped.groups[sortedIndex[k]]);
            }
        };
        for (var _i = 0, _a = modifiers.reverse(); _i < _a.length; _i++) {
            var key = _a[_i];
            _loop_1(key);
        }
        return coll;
    });
}
exports.$sort = $sort;
// MongoDB collation strength to JS localeCompare sensitivity mapping.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare
var COLLATION_STRENGTH = {
    // Only strings that differ in base letters compare as unequal. Examples: a ≠ b, a = á, a = A.
    1: "base",
    //  Only strings that differ in base letters or accents and other diacritic marks compare as unequal.
    // Examples: a ≠ b, a ≠ á, a = A.
    2: "accent",
    // Strings that differ in base letters, accents and other diacritic marks, or case compare as unequal.
    // Other differences may also be taken into consideration. Examples: a ≠ b, a ≠ á, a ≠ A
    3: "variant",
    // case - Only strings that differ in base letters or case compare as unequal. Examples: a ≠ b, a = á, a ≠ A.
};
/**
 * Creates a comparator function for the given collation spec. See https://docs.mongodb.com/manual/reference/collation/
 *
 * @param spec {Object} The MongoDB collation spec.
 * {
 *   locale: string,
 *   caseLevel: boolean,
 *   caseFirst: string,
 *   strength: int,
 *   numericOrdering: boolean,
 *   alternate: string,
 *   maxVariable: string, // unsupported
 *   backwards: boolean // unsupported
 * }
 */
function collationComparator(spec) {
    var localeOpt = {
        sensitivity: COLLATION_STRENGTH[spec.strength || 3],
        caseFirst: spec.caseFirst === "off" ? "false" : spec.caseFirst || "false",
        numeric: spec.numericOrdering || false,
        ignorePunctuation: spec.alternate === "shifted",
    };
    // when caseLevel is true for strength  1:base and 2:accent, bump sensitivity to the nearest that supports case comparison
    if ((spec.caseLevel || false) === true) {
        if (localeOpt.sensitivity === "base")
            localeOpt.sensitivity = "case";
        if (localeOpt.sensitivity === "accent")
            localeOpt.sensitivity = "variant";
    }
    var collator = new Intl.Collator(spec.locale, localeOpt);
    return function (a, b) {
        // non strings
        if (!(0, util_1.isString)(a) || !(0, util_1.isString)(b))
            return (0, util_1.compare)(a, b);
        // only for strings
        var i = collator.compare(a, b);
        if (i < 0)
            return -1;
        if (i > 0)
            return 1;
        return 0;
    };
}


/***/ }),

/***/ 8734:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$sortByCount = void 0;
var group_1 = __webpack_require__(4285);
var sort_1 = __webpack_require__(3469);
/**
 * Groups incoming documents based on the value of a specified expression,
 * then computes the count of documents in each distinct group.
 *
 * https://docs.mongodb.com/manual/reference/operator/aggregation/sortByCount/
 *
 * @param  {Array} collection
 * @param  {Object} expr
 * @param  {Object} options
 * @return {*}
 */
function $sortByCount(collection, expr, options) {
    var newExpr = { count: { $sum: 1 } };
    newExpr["_id"] = expr;
    return (0, sort_1.$sort)((0, group_1.$group)(collection, newExpr, options), { count: -1 }, options);
}
exports.$sortByCount = $sortByCount;


/***/ }),

/***/ 5609:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$unionWith = void 0;
var aggregator_1 = __webpack_require__(8221);
var lazy_1 = __webpack_require__(1088);
var util_1 = __webpack_require__(6588);
/**
 * Performs a union of two collections.
 *
 * @param collection
 * @param expr
 * @param opt
 */
function $unionWith(collection, expr, options) {
    var array = (0, util_1.isString)(expr.coll)
        ? options === null || options === void 0 ? void 0 : options.collectionResolver(expr.coll)
        : expr.coll;
    var iterators = [collection];
    iterators.push(expr.pipeline
        ? new aggregator_1.Aggregator(expr.pipeline, options).stream(array)
        : (0, lazy_1.Lazy)(array));
    return lazy_1.compose.apply(void 0, iterators);
}
exports.$unionWith = $unionWith;


/***/ }),

/***/ 49:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$unset = void 0;
var util_1 = __webpack_require__(6588);
var project_1 = __webpack_require__(8203);
/**
 * Removes/excludes fields from documents.
 *
 * @param collection
 * @param expr
 * @param options
 * @returns {Iterator}
 */
function $unset(collection, expr, options) {
    expr = (0, util_1.ensureArray)(expr);
    var doc = {};
    for (var _i = 0, expr_1 = expr; _i < expr_1.length; _i++) {
        var k = expr_1[_i];
        doc[k] = 0;
    }
    return (0, project_1.$project)(collection, doc, options);
}
exports.$unset = $unset;


/***/ }),

/***/ 8105:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$unwind = void 0;
var lazy_1 = __webpack_require__(1088);
var util_1 = __webpack_require__(6588);
/**
 * Takes an array of documents and returns them as a stream of documents.
 *
 * @param collection
 * @param expr
 * @param options
 * @returns {Array}
 */
function $unwind(collection, expr, options) {
    if ((0, util_1.isString)(expr))
        expr = { path: expr };
    var path = expr.path;
    var field = path.substr(1);
    var includeArrayIndex = (expr === null || expr === void 0 ? void 0 : expr.includeArrayIndex) || false;
    var preserveNullAndEmptyArrays = expr.preserveNullAndEmptyArrays || false;
    var format = function (o, i) {
        if (includeArrayIndex !== false)
            o[includeArrayIndex] = i;
        return o;
    };
    var value;
    return (0, lazy_1.Lazy)(function () {
        var _loop_1 = function () {
            // take from lazy sequence if available
            if (value instanceof lazy_1.Iterator) {
                var tmp = value.next();
                if (!tmp.done)
                    return { value: tmp };
            }
            // fetch next object
            var wrapper = collection.next();
            if (wrapper.done)
                return { value: wrapper };
            // unwrap value
            var obj = wrapper.value;
            // get the value of the field to unwind
            value = (0, util_1.resolve)(obj, field);
            // throw error if value is not an array???
            if (value instanceof Array) {
                if (value.length === 0 && preserveNullAndEmptyArrays === true) {
                    value = null; // reset unwind value
                    (0, util_1.removeValue)(obj, field);
                    return { value: { value: format(obj, null), done: false } };
                }
                else {
                    // construct a lazy sequence for elements per value
                    value = (0, lazy_1.Lazy)(value).map(function (item, i) {
                        var newObj = (0, util_1.resolveGraph)(obj, field, {
                            preserveKeys: true,
                        });
                        (0, util_1.setValue)(newObj, field, item);
                        return format(newObj, i);
                    });
                }
            }
            else if (!(0, util_1.isEmpty)(value) || preserveNullAndEmptyArrays === true) {
                return { value: { value: format(obj, null), done: false } };
            }
        };
        for (;;) {
            var state_1 = _loop_1();
            if (typeof state_1 === "object")
                return state_1.value;
        }
    });
}
exports.$unwind = $unwind;


/***/ }),

/***/ 6842:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// $elemMatch operator. https://docs.mongodb.com/manual/reference/operator/projection/elemMatch/#proj._S_elemMatch
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$elemMatch = void 0;
var query_1 = __webpack_require__(7732);
var util_1 = __webpack_require__(6588);
/**
 * Projects only the first element from an array that matches the specified $elemMatch condition.
 *
 * @param obj
 * @param field
 * @param expr
 * @returns {*}
 */
function $elemMatch(obj, expr, field, options) {
    var arr = (0, util_1.resolve)(obj, field);
    var query = new query_1.Query(expr, options);
    (0, util_1.assert)(arr instanceof Array, "$elemMatch: argument must resolve to array");
    var result = [];
    for (var i = 0; i < arr.length; i++) {
        if (query.test(arr[i])) {
            // MongoDB projects only the first nested document when using this operator.
            // For some use cases this can lead to complicated queries to selectively project nested documents.
            // When strict mode is disabled, we return all matching nested documents.
            if (options.useStrictMode)
                return [arr[i]];
            result.push(arr[i]);
        }
    }
    return result.length > 0 ? result : undefined;
}
exports.$elemMatch = $elemMatch;


/***/ }),

/***/ 7086:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// Projection Operators. https://docs.mongodb.com/manual/reference/operator/projection/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(6842), exports);
__exportStar(__webpack_require__(3526), exports);


/***/ }),

/***/ 3526:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

// $slice operator. https://docs.mongodb.com/manual/reference/operator/projection/slice/#proj._S_slice
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$slice = void 0;
var util_1 = __webpack_require__(6588);
var slice_1 = __webpack_require__(78);
/**
 * Limits the number of elements projected from an array. Supports skip and limit slices.
 *
 * @param obj
 * @param field
 * @param expr
 */
function $slice(obj, expr, field, options) {
    var xs = (0, util_1.resolve)(obj, field);
    var exprAsArray = expr;
    if (!(0, util_1.isArray)(xs))
        return xs;
    return (0, slice_1.$slice)(obj, expr instanceof Array ? __spreadArray([xs], exprAsArray, true) : [xs, expr], options);
}
exports.$slice = $slice;


/***/ }),

/***/ 518:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Array Operators: https://docs.mongodb.com/manual/reference/operator/query-array/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$all = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches arrays that contain all elements specified in the query.
 */
exports.$all = (0, _predicates_1.createQueryOperator)(_predicates_1.$all);


/***/ }),

/***/ 9039:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Array Operators: https://docs.mongodb.com/manual/reference/operator/query-array/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$elemMatch = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Selects documents if element in the array field matches all the specified $elemMatch conditions.
 */
exports.$elemMatch = (0, _predicates_1.createQueryOperator)(_predicates_1.$elemMatch);


/***/ }),

/***/ 844:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(518), exports);
__exportStar(__webpack_require__(9039), exports);
__exportStar(__webpack_require__(9159), exports);


/***/ }),

/***/ 9159:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Array Operators: https://docs.mongodb.com/manual/reference/operator/query-array/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$size = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Selects documents if the array field is a specified size.
 */
exports.$size = (0, _predicates_1.createQueryOperator)(_predicates_1.$size);


/***/ }),

/***/ 7012:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createBitwiseOperator = void 0;
var _predicates_1 = __webpack_require__(2344);
var createBitwiseOperator = function (predicate) {
    return (0, _predicates_1.createQueryOperator)(function (value, mask, options) {
        var b = 0;
        if (mask instanceof Array) {
            for (var _i = 0, mask_1 = mask; _i < mask_1.length; _i++) {
                var n = mask_1[_i];
                b = b | (1 << n);
            }
        }
        else {
            b = mask;
        }
        return predicate(value & b, b);
    });
};
exports.createBitwiseOperator = createBitwiseOperator;


/***/ }),

/***/ 2604:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Bitwise Operators: https://docs.mongodb.com/manual/reference/operator/query-bitwise/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$bitsAllClear = void 0;
var _internal_1 = __webpack_require__(7012);
/**
 * Matches numeric or binary values in which a set of bit positions all have a value of 0.
 */
exports.$bitsAllClear = (0, _internal_1.createBitwiseOperator)(function (result, _) { return result == 0; });


/***/ }),

/***/ 5051:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Bitwise Operators: https://docs.mongodb.com/manual/reference/operator/query-bitwise/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$bitsAllSet = void 0;
var _internal_1 = __webpack_require__(7012);
/**
 * Matches numeric or binary values in which a set of bit positions all have a value of 1.
 */
exports.$bitsAllSet = (0, _internal_1.createBitwiseOperator)(function (result, mask) { return result == mask; });


/***/ }),

/***/ 9904:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Bitwise Operators: https://docs.mongodb.com/manual/reference/operator/query-bitwise/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$bitsAnyClear = void 0;
var _internal_1 = __webpack_require__(7012);
/**
 * Matches numeric or binary values in which any bit from a set of bit positions has a value of 0.
 */
exports.$bitsAnyClear = (0, _internal_1.createBitwiseOperator)(function (result, mask) { return result < mask; });


/***/ }),

/***/ 602:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Bitwise Operators: https://docs.mongodb.com/manual/reference/operator/query-bitwise/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$bitsAnySet = void 0;
var _internal_1 = __webpack_require__(7012);
/**
 * Matches numeric or binary values in which any bit from a set of bit positions has a value of 1.
 */
exports.$bitsAnySet = (0, _internal_1.createBitwiseOperator)(function (result, _) { return result > 0; });


/***/ }),

/***/ 1246:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$bitsAnySet = exports.$bitsAnyClear = exports.$bitsAllSet = exports.$bitsAllClear = void 0;
var bitsAllClear_1 = __webpack_require__(2604);
Object.defineProperty(exports, "$bitsAllClear", ({ enumerable: true, get: function () { return bitsAllClear_1.$bitsAllClear; } }));
var bitsAllSet_1 = __webpack_require__(5051);
Object.defineProperty(exports, "$bitsAllSet", ({ enumerable: true, get: function () { return bitsAllSet_1.$bitsAllSet; } }));
var bitsAnyClear_1 = __webpack_require__(9904);
Object.defineProperty(exports, "$bitsAnyClear", ({ enumerable: true, get: function () { return bitsAnyClear_1.$bitsAnyClear; } }));
var bitsAnySet_1 = __webpack_require__(602);
Object.defineProperty(exports, "$bitsAnySet", ({ enumerable: true, get: function () { return bitsAnySet_1.$bitsAnySet; } }));


/***/ }),

/***/ 1253:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Comparison Operators: https://docs.mongodb.com/manual/reference/operator/query-comparison/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$eq = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches values that are equal to a specified value.
 */
exports.$eq = (0, _predicates_1.createQueryOperator)(_predicates_1.$eq);


/***/ }),

/***/ 2288:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Comparison Operators: https://docs.mongodb.com/manual/reference/operator/query-comparison/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$gt = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches values that are greater than a specified value.
 */
exports.$gt = (0, _predicates_1.createQueryOperator)(_predicates_1.$gt);


/***/ }),

/***/ 6458:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Comparison Operators: https://docs.mongodb.com/manual/reference/operator/query-comparison/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$gte = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * 	Matches values that are greater than or equal to a specified value.
 */
exports.$gte = (0, _predicates_1.createQueryOperator)(_predicates_1.$gte);


/***/ }),

/***/ 7912:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Comparison Operators: https://docs.mongodb.com/manual/reference/operator/query-comparison/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$in = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches any of the values that exist in an array specified in the query.
 */
exports.$in = (0, _predicates_1.createQueryOperator)(_predicates_1.$in);


/***/ }),

/***/ 7701:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$nin = exports.$ne = exports.$lte = exports.$lt = exports.$in = exports.$gte = exports.$gt = exports.$eq = void 0;
var eq_1 = __webpack_require__(1253);
Object.defineProperty(exports, "$eq", ({ enumerable: true, get: function () { return eq_1.$eq; } }));
var gt_1 = __webpack_require__(2288);
Object.defineProperty(exports, "$gt", ({ enumerable: true, get: function () { return gt_1.$gt; } }));
var gte_1 = __webpack_require__(6458);
Object.defineProperty(exports, "$gte", ({ enumerable: true, get: function () { return gte_1.$gte; } }));
var in_1 = __webpack_require__(7912);
Object.defineProperty(exports, "$in", ({ enumerable: true, get: function () { return in_1.$in; } }));
var lt_1 = __webpack_require__(4198);
Object.defineProperty(exports, "$lt", ({ enumerable: true, get: function () { return lt_1.$lt; } }));
var lte_1 = __webpack_require__(4349);
Object.defineProperty(exports, "$lte", ({ enumerable: true, get: function () { return lte_1.$lte; } }));
var ne_1 = __webpack_require__(4708);
Object.defineProperty(exports, "$ne", ({ enumerable: true, get: function () { return ne_1.$ne; } }));
var nin_1 = __webpack_require__(8038);
Object.defineProperty(exports, "$nin", ({ enumerable: true, get: function () { return nin_1.$nin; } }));


/***/ }),

/***/ 4198:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Comparison Operators: https://docs.mongodb.com/manual/reference/operator/query-comparison/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$lt = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches values that are less than the value specified in the query.
 */
exports.$lt = (0, _predicates_1.createQueryOperator)(_predicates_1.$lt);


/***/ }),

/***/ 4349:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Comparison Operators: https://docs.mongodb.com/manual/reference/operator/query-comparison/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$lte = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches values that are less than or equal to the value specified in the query.
 */
exports.$lte = (0, _predicates_1.createQueryOperator)(_predicates_1.$lte);


/***/ }),

/***/ 4708:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Comparison Operators: https://docs.mongodb.com/manual/reference/operator/query-comparison/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$ne = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches all values that are not equal to the value specified in the query.
 */
exports.$ne = (0, _predicates_1.createQueryOperator)(_predicates_1.$ne);


/***/ }),

/***/ 8038:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Comparison Operators: https://docs.mongodb.com/manual/reference/operator/query-comparison/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$nin = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches values that do not exist in an array specified to the query.
 */
exports.$nin = (0, _predicates_1.createQueryOperator)(_predicates_1.$nin);


/***/ }),

/***/ 7402:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Element Operators: https://docs.mongodb.com/manual/reference/operator/query-element/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$exists = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Matches documents that have the specified field.
 */
exports.$exists = (0, _predicates_1.createQueryOperator)(_predicates_1.$exists);


/***/ }),

/***/ 8252:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(7402), exports);
__exportStar(__webpack_require__(442), exports);


/***/ }),

/***/ 442:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Element Operators: https://docs.mongodb.com/manual/reference/operator/query-element/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$type = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Selects documents if a field is of the specified type.
 */
exports.$type = (0, _predicates_1.createQueryOperator)(_predicates_1.$type);


/***/ }),

/***/ 3597:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Evaluation Operators: https://docs.mongodb.com/manual/reference/operator/query-evaluation/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$expr = void 0;
var core_1 = __webpack_require__(7424);
/**
 * Allows the use of aggregation expressions within the query language.
 *
 * @param selector
 * @param value
 * @returns {Function}
 */
function $expr(selector, value, options) {
    return function (obj) { return (0, core_1.computeValue)(obj, value, null, options); };
}
exports.$expr = $expr;


/***/ }),

/***/ 5864:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(3597), exports);
__exportStar(__webpack_require__(5615), exports);
__exportStar(__webpack_require__(5971), exports);
__exportStar(__webpack_require__(9789), exports);
__exportStar(__webpack_require__(8133), exports);


/***/ }),

/***/ 5615:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// Query Evaluation Operators: https://docs.mongodb.com/manual/reference/operator/query-evaluation/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$jsonSchema = void 0;
/**
 * Validate documents against the given JSON Schema.
 *
 * @param selector
 * @param schema
 * @returns {Function}
 */
function $jsonSchema(selector, schema, options) {
    if (!(options === null || options === void 0 ? void 0 : options.jsonSchemaValidator)) {
        throw new Error("Missing option 'jsonSchemaValidator'. Configure to use '$jsonSchema' operator.");
    }
    var validate = options === null || options === void 0 ? void 0 : options.jsonSchemaValidator(schema);
    return function (obj) { return validate(obj); };
}
exports.$jsonSchema = $jsonSchema;


/***/ }),

/***/ 5971:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Evaluation Operators: https://docs.mongodb.com/manual/reference/operator/query-evaluation/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$mod = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Performs a modulo operation on the value of a field and selects documents with a specified result.
 */
exports.$mod = (0, _predicates_1.createQueryOperator)(_predicates_1.$mod);


/***/ }),

/***/ 9789:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Evaluation Operators: https://docs.mongodb.com/manual/reference/operator/query-evaluation/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$regex = void 0;
var _predicates_1 = __webpack_require__(2344);
/**
 * Selects documents where values match a specified regular expression.
 */
exports.$regex = (0, _predicates_1.createQueryOperator)(_predicates_1.$regex);


/***/ }),

/***/ 8133:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Evaluation Operators: https://docs.mongodb.com/manual/reference/operator/query-evaluation/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$where = void 0;
var util_1 = __webpack_require__(6588);
/* eslint-disable */
/**
 * Matches documents that satisfy a JavaScript expression.
 *
 * @param selector
 * @param value
 * @returns {Function}
 */
function $where(selector, value, options) {
    (0, util_1.assert)(options.scriptEnabled, "$where operator requires 'scriptEnabled' option to be true");
    var f = value;
    (0, util_1.assert)((0, util_1.isFunction)(f), "$where only accepts a Function object");
    return function (obj) { return f.call(obj) === true; };
}
exports.$where = $where;


/***/ }),

/***/ 581:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(844), exports);
__exportStar(__webpack_require__(1246), exports);
__exportStar(__webpack_require__(7701), exports);
__exportStar(__webpack_require__(8252), exports);
__exportStar(__webpack_require__(5864), exports);
__exportStar(__webpack_require__(7676), exports);


/***/ }),

/***/ 7770:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Logical Operators: https://docs.mongodb.com/manual/reference/operator/query-logical/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$and = void 0;
var query_1 = __webpack_require__(7732);
var util_1 = __webpack_require__(6588);
/**
 * Joins query clauses with a logical AND returns all documents that match the conditions of both clauses.
 *
 * @param selector
 * @param value
 * @returns {Function}
 */
function $and(selector, value, options) {
    (0, util_1.assert)((0, util_1.isArray)(value), "Invalid expression: $and expects value to be an Array");
    var queries = new Array();
    value.forEach(function (expr) { return queries.push(new query_1.Query(expr, options)); });
    return function (obj) {
        for (var i = 0; i < queries.length; i++) {
            if (!queries[i].test(obj)) {
                return false;
            }
        }
        return true;
    };
}
exports.$and = $and;


/***/ }),

/***/ 7676:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(7770), exports);
__exportStar(__webpack_require__(4538), exports);
__exportStar(__webpack_require__(5002), exports);
__exportStar(__webpack_require__(9967), exports);


/***/ }),

/***/ 4538:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Logical Operators: https://docs.mongodb.com/manual/reference/operator/query-logical/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$nor = void 0;
var util_1 = __webpack_require__(6588);
var or_1 = __webpack_require__(9967);
/**
 * Joins query clauses with a logical NOR returns all documents that fail to match both clauses.
 *
 * @param selector
 * @param value
 * @returns {Function}
 */
function $nor(selector, value, options) {
    (0, util_1.assert)((0, util_1.isArray)(value), "Invalid expression. $nor expects value to be an Array");
    var f = (0, or_1.$or)("$or", value, options);
    return function (obj) { return !f(obj); };
}
exports.$nor = $nor;


/***/ }),

/***/ 5002:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Logical Operators: https://docs.mongodb.com/manual/reference/operator/query-logical/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$not = void 0;
var query_1 = __webpack_require__(7732);
var util_1 = __webpack_require__(6588);
/**
 * Inverts the effect of a query expression and returns documents that do not match the query expression.
 *
 * @param selector
 * @param value
 * @returns {Function}
 */
function $not(selector, value, options) {
    var criteria = {};
    criteria[selector] = (0, util_1.normalize)(value);
    var query = new query_1.Query(criteria, options);
    return function (obj) { return !query.test(obj); };
}
exports.$not = $not;


/***/ }),

/***/ 9967:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Query Logical Operators: https://docs.mongodb.com/manual/reference/operator/query-logical/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.$or = void 0;
var query_1 = __webpack_require__(7732);
var util_1 = __webpack_require__(6588);
/**
 * Joins query clauses with a logical OR returns all documents that match the conditions of either clause.
 *
 * @param selector
 * @param value
 * @returns {Function}
 */
function $or(selector, value, options) {
    (0, util_1.assert)((0, util_1.isArray)(value), "Invalid expression. $or expects value to be an Array");
    var queries = value.map(function (expr) { return new query_1.Query(expr, options); });
    return function (obj) {
        for (var i = 0; i < queries.length; i++) {
            if (queries[i].test(obj)) {
                return true;
            }
        }
        return false;
    };
}
exports.$or = $or;


/***/ }),

/***/ 7732:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Query = void 0;
var core_1 = __webpack_require__(7424);
var cursor_1 = __webpack_require__(9537);
var util_1 = __webpack_require__(6588);
/**
 * An object used to filter input documents
 *
 * @param {Object} criteria The criteria for constructing predicates
 * @param {Options} options Options for use by operators
 * @constructor
 */
var Query = /** @class */ (function () {
    function Query(criteria, options) {
        this.criteria = criteria;
        this.options = options;
        this.options = (0, core_1.initOptions)(options);
        this.compiled = [];
        this.compile();
    }
    Query.prototype.compile = function () {
        (0, util_1.assert)((0, util_1.isObject)(this.criteria), "query criteria must be an object");
        var whereOperator;
        for (var _i = 0, _a = Object.entries(this.criteria); _i < _a.length; _i++) {
            var _b = _a[_i], field = _b[0], expr = _b[1];
            if ("$where" === field) {
                whereOperator = { field: field, expr: expr };
            }
            else if ((0, util_1.inArray)(["$and", "$or", "$nor", "$expr", "$jsonSchema"], field)) {
                this.processOperator(field, field, expr);
            }
            else {
                // normalize expression
                (0, util_1.assert)(!(0, util_1.isOperator)(field), "unknown top level operator: " + field);
                for (var _c = 0, _d = Object.entries((0, util_1.normalize)(expr)); _c < _d.length; _c++) {
                    var _e = _d[_c], operator = _e[0], val = _e[1];
                    this.processOperator(field, operator, val);
                }
            }
            if ((0, util_1.isObject)(whereOperator)) {
                this.processOperator(whereOperator.field, whereOperator.field, whereOperator.expr);
            }
        }
    };
    Query.prototype.processOperator = function (field, operator, value) {
        var call = (0, core_1.getOperator)(core_1.OperatorType.QUERY, operator);
        (0, util_1.assert)(!!call, "unknown operator " + operator);
        var fn = call(field, value, this.options);
        this.compiled.push(fn);
    };
    /**
     * Checks if the object passes the query criteria. Returns true if so, false otherwise.
     *
     * @param obj The object to test
     * @returns {boolean} True or false
     */
    Query.prototype.test = function (obj) {
        for (var i = 0, len = this.compiled.length; i < len; i++) {
            if (!this.compiled[i](obj)) {
                return false;
            }
        }
        return true;
    };
    /**
     * Returns a cursor to select matching documents from the input source.
     *
     * @param source A source providing a sequence of documents
     * @param projection An optional projection criteria
     * @returns {Cursor} A Cursor for iterating over the results
     */
    Query.prototype.find = function (collection, projection) {
        var _this = this;
        return new cursor_1.Cursor(collection, function (x) { return _this.test(x); }, projection || {}, this.options);
    };
    /**
     * Remove matched documents from the collection returning the remainder
     *
     * @param collection An array of documents
     * @returns {Array} A new array with matching elements removed
     */
    Query.prototype.remove = function (collection) {
        var _this = this;
        return collection.reduce(function (acc, obj) {
            if (!_this.test(obj))
                acc.push(obj);
            return acc;
        }, []);
    };
    return Query;
}());
exports.Query = Query;


/***/ }),

/***/ 1463:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BsonType = exports.JsType = void 0;
// Javascript native types
var JsType;
(function (JsType) {
    JsType["NULL"] = "null";
    JsType["UNDEFINED"] = "undefined";
    JsType["BOOLEAN"] = "boolean";
    JsType["NUMBER"] = "number";
    JsType["STRING"] = "string";
    JsType["DATE"] = "date";
    JsType["REGEXP"] = "regexp";
    JsType["ARRAY"] = "array";
    JsType["OBJECT"] = "object";
    JsType["FUNCTION"] = "function";
})(JsType = exports.JsType || (exports.JsType = {}));
// MongoDB BSON types
var BsonType;
(function (BsonType) {
    BsonType["BOOL"] = "bool";
    BsonType["INT"] = "int";
    BsonType["LONG"] = "long";
    BsonType["DOUBLE"] = "double";
    BsonType["DECIMAL"] = "decimal";
    BsonType["REGEX"] = "regex";
})(BsonType = exports.BsonType || (exports.BsonType = {}));


/***/ }),

/***/ 6588:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * Utility constants and functions
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.normalize = exports.isOperator = exports.removeValue = exports.setValue = exports.filterMissing = exports.resolveGraph = exports.resolve = exports.memoize = exports.into = exports.groupBy = exports.sortBy = exports.compare = exports.hashCode = exports.stringify = exports.unique = exports.isEqual = exports.flatten = exports.intersection = exports.merge = exports.objectMap = exports.has = exports.ensureArray = exports.isEmpty = exports.truthy = exports.notInArray = exports.inArray = exports.isNil = exports.isFunction = exports.isRegExp = exports.isDate = exports.isObjectLike = exports.isObject = exports.isArray = exports.isNumber = exports.isString = exports.isBoolean = exports.getType = exports.cloneDeep = exports.assert = exports.MIN_LONG = exports.MAX_LONG = exports.MIN_INT = exports.MAX_INT = void 0;
var types_1 = __webpack_require__(1463);
exports.MAX_INT = 2147483647;
exports.MIN_INT = -2147483648;
exports.MAX_LONG = Number.MAX_SAFE_INTEGER;
exports.MIN_LONG = Number.MIN_SAFE_INTEGER;
// special value to identify missing items. treated differently from undefined
var MISSING = Object.freeze({});
/**
 * Uses the simple hash method as described in Effective Java.
 * @see https://stackoverflow.com/a/113600/1370481
 * @param value The value to hash
 * @returns {number}
 */
var DEFAULT_HASH_FUNCTION = function (value) {
    var s = stringify(value);
    var hash = 0;
    var i = s.length;
    while (i)
        hash = ((hash << 5) - hash) ^ s.charCodeAt(--i);
    return hash >>> 0;
};
// no array, object, or function types
var JS_SIMPLE_TYPES = [
    types_1.JsType.NULL,
    types_1.JsType.UNDEFINED,
    types_1.JsType.BOOLEAN,
    types_1.JsType.NUMBER,
    types_1.JsType.STRING,
    types_1.JsType.DATE,
    types_1.JsType.REGEXP,
];
var OBJECT_PROTOTYPE = Object.getPrototypeOf({});
var OBJECT_TAG = "[object Object]";
var OBJECT_TYPE_RE = /^\[object ([a-zA-Z0-9]+)\]$/;
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
exports.assert = assert;
/**
 * Deep clone an object
 */
function cloneDeep(obj) {
    if (obj instanceof Array)
        return obj.map(cloneDeep);
    if (obj instanceof Date)
        return new Date(obj);
    if (isObject(obj))
        return objectMap(obj, cloneDeep);
    return obj;
}
exports.cloneDeep = cloneDeep;
/**
 * Returns the name of type as specified in the tag returned by a call to Object.prototype.toString
 * @param v A value
 */
function getType(v) {
    return OBJECT_TYPE_RE.exec(Object.prototype.toString.call(v))[1];
}
exports.getType = getType;
function isBoolean(v) {
    return typeof v === types_1.JsType.BOOLEAN;
}
exports.isBoolean = isBoolean;
function isString(v) {
    return typeof v === types_1.JsType.STRING;
}
exports.isString = isString;
function isNumber(v) {
    return !isNaN(v) && typeof v === types_1.JsType.NUMBER;
}
exports.isNumber = isNumber;
exports.isArray = Array.isArray;
function isObject(v) {
    if (!v)
        return false;
    var proto = Object.getPrototypeOf(v);
    return ((proto === OBJECT_PROTOTYPE || proto === null) &&
        OBJECT_TAG === Object.prototype.toString.call(v));
}
exports.isObject = isObject;
function isObjectLike(v) {
    return v === Object(v);
} // objects, arrays, functions, date, custom object
exports.isObjectLike = isObjectLike;
function isDate(v) {
    return v instanceof Date;
}
exports.isDate = isDate;
function isRegExp(v) {
    return v instanceof RegExp;
}
exports.isRegExp = isRegExp;
function isFunction(v) {
    return typeof v === types_1.JsType.FUNCTION;
}
exports.isFunction = isFunction;
function isNil(v) {
    return v === null || v === undefined;
}
exports.isNil = isNil;
function inArray(arr, item) {
    return arr.includes(item);
}
exports.inArray = inArray;
function notInArray(arr, item) {
    return !inArray(arr, item);
}
exports.notInArray = notInArray;
function truthy(arg) {
    return !!arg;
}
exports.truthy = truthy;
function isEmpty(x) {
    return (isNil(x) ||
        (isString(x) && !x) ||
        (x instanceof Array && x.length === 0) ||
        (isObject(x) && Object.keys(x).length === 0));
}
exports.isEmpty = isEmpty;
// ensure a value is an array or wrapped within one
function ensureArray(x) {
    return x instanceof Array ? x : [x];
}
exports.ensureArray = ensureArray;
function has(obj, prop) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, prop);
}
exports.has = has;
/**
 * Transform values in an object
 *
 * @param  {Object}   obj   An object whose values to transform
 * @param  {Function} fn The transform function
 * @return {Array|Object} Result object after applying the transform
 */
function objectMap(obj, fn) {
    var o = {};
    var objKeys = Object.keys(obj);
    for (var i = 0; i < objKeys.length; i++) {
        var k = objKeys[i];
        o[k] = fn(obj[k], k);
    }
    return o;
}
exports.objectMap = objectMap;
/**
 * Deep merge objects or arrays.
 * When the inputs have unmergeable types, the source value (right hand side) is returned.
 * If inputs are arrays of same length and all elements are mergable, elements in the same position are merged together.
 * If AnyVal of the elements are unmergeable, elements in the source are appended to the target.
 * @param target {Object|Array} the target to merge into
 * @param obj {Object|Array} the source object
 */
function merge(target, obj, options) {
    // take care of missing inputs
    if (target === MISSING)
        return obj;
    if (obj === MISSING)
        return target;
    var inputs = [target, obj];
    if (!(inputs.every(isObject) || inputs.every(exports.isArray))) {
        throw Error("mismatched types. must both be array or object");
    }
    // default options
    options = options || { flatten: false };
    if ((0, exports.isArray)(target)) {
        var result = target;
        var input = obj;
        if (options.flatten) {
            var i = 0;
            var j = 0;
            while (i < result.length && j < input.length) {
                result[i] = merge(result[i++], input[j++], options);
            }
            while (j < input.length) {
                result.push(obj[j++]);
            }
        }
        else {
            into(result, input);
        }
    }
    else {
        Object.keys(obj).forEach(function (k) {
            if (has(obj, k)) {
                if (has(target, k)) {
                    target[k] = merge(target[k], obj[k], options);
                }
                else {
                    target[k] = obj[k];
                }
            }
        });
    }
    return target;
}
exports.merge = merge;
function addIndex(root, key, index) {
    if (root.key < key) {
        if (root.right) {
            addIndex(root.right, key, index);
        }
        else {
            root.right = { key: key, indexes: [index] };
        }
    }
    else if (root.key > key) {
        if (root.left) {
            addIndex(root.left, key, index);
        }
        else {
            root.left = { key: key, indexes: [index] };
        }
    }
    else {
        root.indexes.push(index);
    }
}
function getIndexes(root, key) {
    if (root.key == key) {
        return root.indexes;
    }
    else if (root.key < key) {
        return root.right ? getIndexes(root.right, key) : undefined;
    }
    else if (root.key > key) {
        return root.left ? getIndexes(root.left, key) : undefined;
    }
    return undefined;
}
/**
 * Returns the intersection of multiple arrays.
 *
 * @param  {Array} a The first array
 * @param  {Array} b The second array
 * @param  {Function} hashFunction Custom function to hash values, default the hashCode method
 * @return {Array}    Result array
 */
function intersection(input, hashFunction) {
    if (hashFunction === void 0) { hashFunction = DEFAULT_HASH_FUNCTION; }
    // if any array is empty, there is no intersection
    if (input.some(function (arr) { return arr.length == 0; }))
        return [];
    // sort input arrays by size
    var sortedIndex = input.map(function (a, i) { return [i, a.length]; });
    sortedIndex.sort(function (a, b) { return a[1] - b[1]; });
    // matched items index of first array for all other arrays.
    var result = [];
    var smallestArray = input[sortedIndex[0][0]];
    var root = {
        key: hashCode(smallestArray[0], hashFunction),
        indexes: [0],
    };
    for (var i = 1; i < smallestArray.length; i++) {
        var val = smallestArray[i];
        var h = hashCode(val, hashFunction);
        addIndex(root, h, i);
    }
    var maxResultSize = sortedIndex[0][1];
    var orderedIndexes = [];
    var _loop_1 = function (i) {
        var arrayIndex = sortedIndex[i][0];
        var data = input[arrayIndex];
        // number of matched items
        var size = 0;
        var _loop_2 = function (j) {
            var h = hashCode(data[j], hashFunction);
            var indexes = getIndexes(root, h);
            // not included.
            if (!indexes)
                return "continue";
            // check items equality to mitigate hash collisions and select the matching index.
            var idx = indexes
                .map(function (n) { return smallestArray[n]; })
                .findIndex(function (v) { return isEqual(v, data[j]); });
            // not included
            if (idx == -1)
                return "continue";
            // item matched. ensure map exist for marking index
            if (result.length < i)
                result.push({});
            // map to index of the actual value and set position
            result[result.length - 1][indexes[idx]] = true;
            // if we have seen max result items we can stop.
            size = Object.keys(result[result.length - 1]).length;
            // ensure stabilty
            if (arrayIndex == 0) {
                if (orderedIndexes.indexOf(indexes[idx]) == -1) {
                    orderedIndexes.push(indexes[idx]);
                }
            }
        };
        for (var j = 0; j < data.length; j++) {
            _loop_2(j);
        }
        // no intersection if nothing found
        if (size == 0)
            return { value: [] };
        // new max result size
        maxResultSize = Math.min(maxResultSize, size);
    };
    for (var i = 1; i < sortedIndex.length; i++) {
        var state_1 = _loop_1(i);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    var freq = {};
    // count occurrences
    result.forEach(function (m) {
        Object.keys(m).forEach(function (k) {
            var n = parseFloat(k);
            freq[n] = freq[n] || 0;
            freq[n]++;
        });
    });
    var keys = orderedIndexes;
    if (keys.length == 0) {
        // note: cannot use parseInt due to second argument for radix.
        keys.push.apply(keys, Object.keys(freq).map(parseFloat));
        keys.sort();
    }
    return keys
        .filter(function (n) { return freq[n] == input.length - 1; })
        .map(function (n) { return smallestArray[n]; });
}
exports.intersection = intersection;
/**
 * Flatten the array
 *
 * @param  {Array} xs The array to flatten
 * @param {Number} depth The number of nested lists to iterate
 */
function flatten(xs, depth) {
    var arr = [];
    function flatten2(ys, n) {
        for (var i = 0, len = ys.length; i < len; i++) {
            if ((0, exports.isArray)(ys[i]) && (n > 0 || n < 0)) {
                flatten2(ys[i], Math.max(-1, n - 1));
            }
            else {
                arr.push(ys[i]);
            }
        }
    }
    flatten2(xs, depth);
    return arr;
}
exports.flatten = flatten;
/**
 * Determine whether two values are the same or strictly equivalent
 *
 * @param  {*}  a The first value
 * @param  {*}  b The second value
 * @return {Boolean}   Result of comparison
 */
function isEqual(a, b) {
    var lhs = [a];
    var rhs = [b];
    while (lhs.length > 0) {
        a = lhs.pop();
        b = rhs.pop();
        // strictly equal must be equal.
        if (a === b)
            continue;
        // unequal types and functions cannot be equal.
        var nativeType = getType(a).toLowerCase();
        if (nativeType !== getType(b).toLowerCase() ||
            nativeType === types_1.JsType.FUNCTION) {
            return false;
        }
        // leverage toString for Date and RegExp types
        if (nativeType === types_1.JsType.ARRAY) {
            var xs = a;
            var ys = b;
            if (xs.length !== ys.length)
                return false;
            if (xs.length === ys.length && xs.length === 0)
                continue;
            into(lhs, xs);
            into(rhs, ys);
        }
        else if (nativeType === types_1.JsType.OBJECT) {
            // deep compare objects
            var aKeys = Object.keys(a);
            var bKeys = Object.keys(b);
            // check length of keys early
            if (aKeys.length !== bKeys.length)
                return false;
            // compare keys
            for (var i = 0, len = aKeys.length; i < len; i++) {
                var k = aKeys[i];
                // not found
                if (!has(b, k))
                    return false;
                // key found
                lhs.push(a[k]);
                rhs.push(b[k]);
            }
        }
        else {
            // compare encoded values
            if (stringify(a) !== stringify(b))
                return false;
        }
    }
    return lhs.length === 0;
}
exports.isEqual = isEqual;
/**
 * Return a new unique version of the collection
 * @param  {Array} xs The input collection
 * @return {Array}
 */
function unique(xs, hashFunction) {
    if (hashFunction === void 0) { hashFunction = DEFAULT_HASH_FUNCTION; }
    if (xs.length == 0)
        return [];
    var root = {
        key: hashCode(xs[0], hashFunction),
        indexes: [0],
    };
    // hash items on to tree to track collisions
    for (var i = 1; i < xs.length; i++) {
        addIndex(root, hashCode(xs[i], hashFunction), i);
    }
    var result = [];
    // walk tree and remove duplicates
    var stack = [root];
    while (stack.length > 0) {
        var node = stack.pop();
        if (node.indexes.length == 1) {
            result.push(node.indexes[0]);
        }
        else {
            // handle collisions by matching all items
            var arr = node.indexes;
            // we start by search from the back so we maintain the smaller index when there is a duplicate.
            while (arr.length > 0) {
                for (var j = 1; j < arr.length; j++) {
                    // if last item matches any remove the last item.
                    if (isEqual(xs[arr[arr.length - 1]], xs[arr[arr.length - 1 - j]])) {
                        // remove last item
                        arr.pop();
                        // reset position
                        j = 0;
                    }
                }
                // add the unique item
                result.push(arr.pop());
            }
        }
        // add children
        if (node.left)
            stack.push(node.left);
        if (node.right)
            stack.push(node.right);
    }
    // sort indexes for stability
    result.sort();
    // return the unique items
    return result.map(function (i) { return xs[i]; });
}
exports.unique = unique;
/**
 * Encode value to string using a simple non-colliding stable scheme.
 *
 * @param value
 * @returns {*}
 */
function stringify(value) {
    var type = getType(value).toLowerCase();
    switch (type) {
        case types_1.JsType.BOOLEAN:
        case types_1.JsType.NUMBER:
        case types_1.JsType.REGEXP:
            return value.toString();
        case types_1.JsType.STRING:
            return JSON.stringify(value);
        case types_1.JsType.DATE:
            return value.toISOString();
        case types_1.JsType.NULL:
        case types_1.JsType.UNDEFINED:
            return type;
        case types_1.JsType.ARRAY:
            return "[" + value.map(stringify).join(",") + "]";
        default:
            break;
    }
    // default case
    var prefix = type === types_1.JsType.OBJECT ? "" : "" + getType(value);
    var objKeys = Object.keys(value);
    objKeys.sort();
    return (prefix + "{" +
        objKeys.map(function (k) { return stringify(k) + ":" + stringify(value[k]); }).join(",") +
        "}");
}
exports.stringify = stringify;
/**
 * Generate hash code
 * This selected function is the result of benchmarking various hash functions.
 * This version performs well and can hash 10^6 documents in ~3s with on average 100 collisions.
 *
 * @param value
 * @returns {number|null}
 */
function hashCode(value, hashFunction) {
    if (hashFunction === void 0) { hashFunction = DEFAULT_HASH_FUNCTION; }
    if (isNil(value))
        return null;
    return hashFunction(value).toString();
}
exports.hashCode = hashCode;
/**
 * Default compare function
 * @param {*} a
 * @param {*} b
 */
function compare(a, b) {
    if (a < b)
        return -1;
    if (a > b)
        return 1;
    return 0;
}
exports.compare = compare;
/**
 * Returns a (stably) sorted copy of list, ranked in ascending order by the results of running each value through iteratee
 *
 * This implementation treats null/undefined sort keys as less than every other type
 *
 * @param {Array}   collection
 * @param {Function} keyFn The sort key function used to resolve sort keys
 * @param {Function} comparator The comparator function to use for comparing keys. Defaults to standard comparison via `compare(...)`
 * @return {Array} Returns a new sorted array by the given key and comparator function
 */
function sortBy(collection, keyFn, comparator) {
    var sorted = new Array();
    var result = new Array();
    var hash = {};
    comparator = comparator || compare;
    if (isEmpty(collection))
        return collection;
    for (var i = 0; i < collection.length; i++) {
        var obj = collection[i];
        var key = keyFn(obj, i);
        // objects with nil keys will go in first
        if (isNil(key)) {
            result.push(obj);
        }
        else {
            // null suffix to differentiate string keys from native object properties
            if (isString(key))
                key += "\0";
            if (hash[key]) {
                hash[key].push(obj);
            }
            else {
                hash[key] = [obj];
                sorted.push(key);
            }
        }
    }
    // use native array sorting but enforce stableness
    sorted.sort(comparator);
    for (var i = 0; i < sorted.length; i++) {
        into(result, hash[sorted[i]]);
    }
    return result;
}
exports.sortBy = sortBy;
/**
 * Groups the collection into sets by the returned key
 *
 * @param collection
 * @param keyFn {Function} to compute the group key of an item in the collection
 * @returns {{keys: Array, groups: Array}}
 */
function groupBy(collection, keyFn, hashFunction) {
    if (hashFunction === void 0) { hashFunction = DEFAULT_HASH_FUNCTION; }
    var result = {
        keys: new Array(),
        groups: new Array(),
    };
    var lookup = {};
    for (var i = 0; i < collection.length; i++) {
        var obj = collection[i];
        var key = keyFn(obj, i);
        var hash = hashCode(key, hashFunction);
        var index = -1;
        if (lookup[hash] === undefined) {
            index = result.keys.length;
            lookup[hash] = index;
            result.keys.push(key);
            result.groups.push([]);
        }
        index = lookup[hash];
        result.groups[index].push(obj);
    }
    return result;
}
exports.groupBy = groupBy;
// max elements to push.
// See argument limit https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply
var MAX_ARRAY_PUSH = 50000;
/**
 * Merge elements into the dest
 *
 * @param {*} target The target object
 * @param {*} rest The array of elements to merge into dest
 */
function into(target) {
    var rest = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        rest[_i - 1] = arguments[_i];
    }
    if (target instanceof Array) {
        return rest.reduce(function (acc, arr) {
            // push arrary in batches to handle large inputs
            var i = Math.ceil(arr.length / MAX_ARRAY_PUSH);
            var begin = 0;
            while (i-- > 0) {
                Array.prototype.push.apply(acc, arr.slice(begin, begin + MAX_ARRAY_PUSH));
                begin += MAX_ARRAY_PUSH;
            }
            return acc;
        }, target);
    }
    else {
        // merge objects. same behaviour as Object.assign
        return rest.filter(isObjectLike).reduce(function (acc, item) {
            Object.assign(acc, item);
            return acc;
        }, target);
    }
}
exports.into = into;
/**
 * This is a generic memoization function
 *
 * This implementation uses a cache independent of the function being memoized
 * to allow old values to be garbage collected when the memoized function goes out of scope.
 *
 * @param {*} fn The function object to memoize
 */
function memoize(fn, hashFunction) {
    var _this = this;
    if (hashFunction === void 0) { hashFunction = DEFAULT_HASH_FUNCTION; }
    return (function (memo) {
        return function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            var key = hashCode(args, hashFunction);
            if (!has(memo, key)) {
                memo[key] = fn.apply(_this, args);
            }
            return memo[key];
        };
    })({
    /* storage */
    });
}
exports.memoize = memoize;
// mingo internal
/**
 * Retrieve the value of a given key on an object
 * @param obj
 * @param key
 * @returns {*}
 * @private
 */
function getValue(obj, key) {
    return isObjectLike(obj) ? obj[key] : undefined;
}
/**
 * Unwrap a single element array to specified depth
 * @param {Array} arr
 * @param {Number} depth
 */
function unwrap(arr, depth) {
    if (depth < 1)
        return arr;
    while (depth-- && arr.length === 1)
        arr = arr[0];
    return arr;
}
/**
 * Resolve the value of the field (dot separated) on the given object
 * @param obj {Object} the object context
 * @param selector {String} dot separated path to field
 * @returns {*}
 */
function resolve(obj, selector, options) {
    var depth = 0;
    function resolve2(o, path) {
        var value = o;
        var _loop_3 = function (i) {
            var field = path[i];
            var isText = /^\d+$/.exec(field) === null;
            // using instanceof to aid typescript compiler
            if (isText && value instanceof Array) {
                // On the first iteration, we check if we received a stop flag.
                // If so, we stop to prevent iterating over a nested array value
                // on consecutive object keys in the selector.
                if (i === 0 && depth > 0)
                    return "break";
                depth += 1;
                // only look at the rest of the path
                var subpath_1 = path.slice(i);
                value = value.reduce(function (acc, item) {
                    var v = resolve2(item, subpath_1);
                    if (v !== undefined)
                        acc.push(v);
                    return acc;
                }, []);
                return "break";
            }
            else {
                value = getValue(value, field);
            }
            if (value === undefined)
                return "break";
        };
        for (var i = 0; i < path.length; i++) {
            var state_2 = _loop_3(i);
            if (state_2 === "break")
                break;
        }
        return value;
    }
    var result = inArray(JS_SIMPLE_TYPES, getType(obj).toLowerCase())
        ? obj
        : resolve2(obj, selector.split("."));
    return result instanceof Array && (options === null || options === void 0 ? void 0 : options.unwrapArray)
        ? unwrap(result, depth)
        : result;
}
exports.resolve = resolve;
/**
 * Returns the full object to the resolved value given by the selector.
 * This function excludes empty values as they aren't practically useful.
 *
 * @param obj {Object} the object context
 * @param selector {String} dot separated path to field
 */
function resolveGraph(obj, selector, options) {
    var names = selector.split(".");
    var key = names[0];
    // get the next part of the selector
    var next = names.slice(1).join(".");
    var isIndex = /^\d+$/.exec(key) !== null;
    var hasNext = names.length > 1;
    var result;
    var value;
    if (obj instanceof Array) {
        if (isIndex) {
            result = getValue(obj, Number(key));
            if (hasNext) {
                result = resolveGraph(result, next, options);
            }
            result = [result];
        }
        else {
            result = [];
            for (var _i = 0, obj_1 = obj; _i < obj_1.length; _i++) {
                var item = obj_1[_i];
                value = resolveGraph(item, selector, options);
                if (options === null || options === void 0 ? void 0 : options.preserveMissing) {
                    if (value === undefined) {
                        value = MISSING;
                    }
                    result.push(value);
                }
                else if (value !== undefined) {
                    result.push(value);
                }
            }
        }
    }
    else {
        value = getValue(obj, key);
        if (hasNext) {
            value = resolveGraph(value, next, options);
        }
        if (value === undefined)
            return undefined;
        result = (options === null || options === void 0 ? void 0 : options.preserveKeys) ? __assign({}, obj) : {};
        result[key] = value;
    }
    return result;
}
exports.resolveGraph = resolveGraph;
/**
 * Filter out all MISSING values from the object in-place
 *
 * @param obj The object to filter
 */
function filterMissing(obj) {
    if (obj instanceof Array) {
        for (var i = obj.length - 1; i >= 0; i--) {
            if (obj[i] === MISSING) {
                obj.splice(i, 1);
            }
            else {
                filterMissing(obj[i]);
            }
        }
    }
    else if (isObject(obj)) {
        for (var k in obj) {
            if (has(obj, k)) {
                filterMissing(obj[k]);
            }
        }
    }
}
exports.filterMissing = filterMissing;
/**
 * Walk the object graph and execute the given transform function
 *
 * @param  {Object|Array} obj   The object to traverse
 * @param  {String} selector    The selector
 * @param  {Function} fn Function to execute for value at the end the traversal
 * @return {*}
 */
function walk(obj, selector, fn, options) {
    if (isNil(obj))
        return;
    var names = selector.split(".");
    var key = names[0];
    var next = names.slice(1).join(".");
    if (names.length === 1) {
        fn(obj, key);
    }
    else {
        // force the rest of the graph while traversing
        if ((options === null || options === void 0 ? void 0 : options.buildGraph) === true && isNil(obj[key])) {
            obj[key] = {};
        }
        walk(obj[key], next, fn, options);
    }
}
/**
 * Set the value of the given object field
 *
 * @param obj {Object|Array} the object context
 * @param selector {String} path to field
 * @param value {*} the value to set
 */
function setValue(obj, selector, value) {
    walk(obj, selector, function (item, key) {
        item[key] = value;
    }, { buildGraph: true });
}
exports.setValue = setValue;
/**
 * Removes an element from the container.
 * If the selector resolves to an array and the leaf is a non-numeric key,
 * the remove operation will be performed on objects of the array.
 *
 * @param obj {ArrayOrObject} object or array
 * @param selector {String} dot separated path to element to remove
 */
function removeValue(obj, selector, options) {
    walk(obj, selector, function (item, key) {
        if (item instanceof Array) {
            if (/^\d+$/.test(key)) {
                item.splice(parseInt(key), 1);
            }
            else if (options && options.descendArray) {
                for (var _i = 0, item_1 = item; _i < item_1.length; _i++) {
                    var elem = item_1[_i];
                    if (isObject(elem)) {
                        delete elem[key];
                    }
                }
            }
        }
        else if (isObject(item)) {
            delete item[key];
        }
    });
}
exports.removeValue = removeValue;
var OPERATOR_NAME_PATTERN = /^\$[a-zA-Z0-9_]+$/;
/**
 * Check whether the given name passes for an operator. We assume AnyVal field name starting with '$' is an operator.
 * This is cheap and safe to do since keys beginning with '$' should be reserved for internal use.
 * @param {String} name
 */
function isOperator(name) {
    return OPERATOR_NAME_PATTERN.test(name);
}
exports.isOperator = isOperator;
/**
 * Simplify expression for easy evaluation with query operators map
 * @param expr
 * @returns {*}
 */
function normalize(expr) {
    // normalized primitives
    if (inArray(JS_SIMPLE_TYPES, getType(expr).toLowerCase())) {
        return isRegExp(expr) ? { $regex: expr } : { $eq: expr };
    }
    // normalize object expression. using ObjectLike handles custom types
    if (isObjectLike(expr)) {
        // no valid query operator found, so we do simple comparison
        if (!Object.keys(expr).some(isOperator)) {
            return { $eq: expr };
        }
        // ensure valid regex
        if (has(expr, "$regex")) {
            return {
                $regex: new RegExp(expr["$regex"], expr["$options"]),
            };
        }
    }
    return expr;
}
exports.normalize = normalize;


/***/ }),

/***/ 3689:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "decode": () => (/* binding */ decode),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   "encode": () => (/* binding */ encode),
/* harmony export */   "toASCII": () => (/* binding */ toASCII),
/* harmony export */   "toUnicode": () => (/* binding */ toUnicode),
/* harmony export */   "ucs2decode": () => (/* binding */ ucs2decode),
/* harmony export */   "ucs2encode": () => (/* binding */ ucs2encode)
/* harmony export */ });


/** Highest positive signed 32-bit float value */
const maxInt = 2147483647; // aka. 0x7FFFFFFF or 2^31-1

/** Bootstring parameters */
const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128; // 0x80
const delimiter = '-'; // '\x2D'

/** Regular expressions */
const regexPunycode = /^xn--/;
const regexNonASCII = /[^\0-\x7E]/; // non-ASCII chars
const regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g; // RFC 3490 separators

/** Error messages */
const errors = {
	'overflow': 'Overflow: input needs wider integers to process',
	'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
	'invalid-input': 'Invalid input'
};

/** Convenience shortcuts */
const baseMinusTMin = base - tMin;
const floor = Math.floor;
const stringFromCharCode = String.fromCharCode;

/*--------------------------------------------------------------------------*/

/**
 * A generic error utility function.
 * @private
 * @param {String} type The error type.
 * @returns {Error} Throws a `RangeError` with the applicable error message.
 */
function error(type) {
	throw new RangeError(errors[type]);
}

/**
 * A generic `Array#map` utility function.
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} callback The function that gets called for every array
 * item.
 * @returns {Array} A new array of values returned by the callback function.
 */
function map(array, fn) {
	const result = [];
	let length = array.length;
	while (length--) {
		result[length] = fn(array[length]);
	}
	return result;
}

/**
 * A simple `Array#map`-like wrapper to work with domain name strings or email
 * addresses.
 * @private
 * @param {String} domain The domain name or email address.
 * @param {Function} callback The function that gets called for every
 * character.
 * @returns {Array} A new string of characters returned by the callback
 * function.
 */
function mapDomain(string, fn) {
	const parts = string.split('@');
	let result = '';
	if (parts.length > 1) {
		// In email addresses, only the domain name should be punycoded. Leave
		// the local part (i.e. everything up to `@`) intact.
		result = parts[0] + '@';
		string = parts[1];
	}
	// Avoid `split(regex)` for IE8 compatibility. See #17.
	string = string.replace(regexSeparators, '\x2E');
	const labels = string.split('.');
	const encoded = map(labels, fn).join('.');
	return result + encoded;
}

/**
 * Creates an array containing the numeric code points of each Unicode
 * character in the string. While JavaScript uses UCS-2 internally,
 * this function will convert a pair of surrogate halves (each of which
 * UCS-2 exposes as separate characters) into a single code point,
 * matching UTF-16.
 * @see `punycode.ucs2.encode`
 * @see <https://mathiasbynens.be/notes/javascript-encoding>
 * @memberOf punycode.ucs2
 * @name decode
 * @param {String} string The Unicode input string (UCS-2).
 * @returns {Array} The new array of code points.
 */
function ucs2decode(string) {
	const output = [];
	let counter = 0;
	const length = string.length;
	while (counter < length) {
		const value = string.charCodeAt(counter++);
		if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
			// It's a high surrogate, and there is a next character.
			const extra = string.charCodeAt(counter++);
			if ((extra & 0xFC00) == 0xDC00) { // Low surrogate.
				output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
			} else {
				// It's an unmatched surrogate; only append this code unit, in case the
				// next code unit is the high surrogate of a surrogate pair.
				output.push(value);
				counter--;
			}
		} else {
			output.push(value);
		}
	}
	return output;
}

/**
 * Creates a string based on an array of numeric code points.
 * @see `punycode.ucs2.decode`
 * @memberOf punycode.ucs2
 * @name encode
 * @param {Array} codePoints The array of numeric code points.
 * @returns {String} The new Unicode string (UCS-2).
 */
const ucs2encode = array => String.fromCodePoint(...array);

/**
 * Converts a basic code point into a digit/integer.
 * @see `digitToBasic()`
 * @private
 * @param {Number} codePoint The basic numeric code point value.
 * @returns {Number} The numeric value of a basic code point (for use in
 * representing integers) in the range `0` to `base - 1`, or `base` if
 * the code point does not represent a value.
 */
const basicToDigit = function(codePoint) {
	if (codePoint - 0x30 < 0x0A) {
		return codePoint - 0x16;
	}
	if (codePoint - 0x41 < 0x1A) {
		return codePoint - 0x41;
	}
	if (codePoint - 0x61 < 0x1A) {
		return codePoint - 0x61;
	}
	return base;
};

/**
 * Converts a digit/integer into a basic code point.
 * @see `basicToDigit()`
 * @private
 * @param {Number} digit The numeric value of a basic code point.
 * @returns {Number} The basic code point whose value (when used for
 * representing integers) is `digit`, which needs to be in the range
 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
 * used; else, the lowercase form is used. The behavior is undefined
 * if `flag` is non-zero and `digit` has no uppercase form.
 */
const digitToBasic = function(digit, flag) {
	//  0..25 map to ASCII a..z or A..Z
	// 26..35 map to ASCII 0..9
	return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
};

/**
 * Bias adaptation function as per section 3.4 of RFC 3492.
 * https://tools.ietf.org/html/rfc3492#section-3.4
 * @private
 */
const adapt = function(delta, numPoints, firstTime) {
	let k = 0;
	delta = firstTime ? floor(delta / damp) : delta >> 1;
	delta += floor(delta / numPoints);
	for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
		delta = floor(delta / baseMinusTMin);
	}
	return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
};

/**
 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
 * symbols.
 * @memberOf punycode
 * @param {String} input The Punycode string of ASCII-only symbols.
 * @returns {String} The resulting string of Unicode symbols.
 */
const decode = function(input) {
	// Don't use UCS-2.
	const output = [];
	const inputLength = input.length;
	let i = 0;
	let n = initialN;
	let bias = initialBias;

	// Handle the basic code points: let `basic` be the number of input code
	// points before the last delimiter, or `0` if there is none, then copy
	// the first basic code points to the output.

	let basic = input.lastIndexOf(delimiter);
	if (basic < 0) {
		basic = 0;
	}

	for (let j = 0; j < basic; ++j) {
		// if it's not a basic code point
		if (input.charCodeAt(j) >= 0x80) {
			error('not-basic');
		}
		output.push(input.charCodeAt(j));
	}

	// Main decoding loop: start just after the last delimiter if any basic code
	// points were copied; start at the beginning otherwise.

	for (let index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

		// `index` is the index of the next character to be consumed.
		// Decode a generalized variable-length integer into `delta`,
		// which gets added to `i`. The overflow checking is easier
		// if we increase `i` as we go, then subtract off its starting
		// value at the end to obtain `delta`.
		let oldi = i;
		for (let w = 1, k = base; /* no condition */; k += base) {

			if (index >= inputLength) {
				error('invalid-input');
			}

			const digit = basicToDigit(input.charCodeAt(index++));

			if (digit >= base || digit > floor((maxInt - i) / w)) {
				error('overflow');
			}

			i += digit * w;
			const t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

			if (digit < t) {
				break;
			}

			const baseMinusT = base - t;
			if (w > floor(maxInt / baseMinusT)) {
				error('overflow');
			}

			w *= baseMinusT;

		}

		const out = output.length + 1;
		bias = adapt(i - oldi, out, oldi == 0);

		// `i` was supposed to wrap around from `out` to `0`,
		// incrementing `n` each time, so we'll fix that now:
		if (floor(i / out) > maxInt - n) {
			error('overflow');
		}

		n += floor(i / out);
		i %= out;

		// Insert `n` at position `i` of the output.
		output.splice(i++, 0, n);

	}

	return String.fromCodePoint(...output);
};

/**
 * Converts a string of Unicode symbols (e.g. a domain name label) to a
 * Punycode string of ASCII-only symbols.
 * @memberOf punycode
 * @param {String} input The string of Unicode symbols.
 * @returns {String} The resulting Punycode string of ASCII-only symbols.
 */
const encode = function(input) {
	const output = [];

	// Convert the input in UCS-2 to an array of Unicode code points.
	input = ucs2decode(input);

	// Cache the length.
	let inputLength = input.length;

	// Initialize the state.
	let n = initialN;
	let delta = 0;
	let bias = initialBias;

	// Handle the basic code points.
	for (const currentValue of input) {
		if (currentValue < 0x80) {
			output.push(stringFromCharCode(currentValue));
		}
	}

	let basicLength = output.length;
	let handledCPCount = basicLength;

	// `handledCPCount` is the number of code points that have been handled;
	// `basicLength` is the number of basic code points.

	// Finish the basic string with a delimiter unless it's empty.
	if (basicLength) {
		output.push(delimiter);
	}

	// Main encoding loop:
	while (handledCPCount < inputLength) {

		// All non-basic code points < n have been handled already. Find the next
		// larger one:
		let m = maxInt;
		for (const currentValue of input) {
			if (currentValue >= n && currentValue < m) {
				m = currentValue;
			}
		}

		// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
		// but guard against overflow.
		const handledCPCountPlusOne = handledCPCount + 1;
		if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
			error('overflow');
		}

		delta += (m - n) * handledCPCountPlusOne;
		n = m;

		for (const currentValue of input) {
			if (currentValue < n && ++delta > maxInt) {
				error('overflow');
			}
			if (currentValue == n) {
				// Represent delta as a generalized variable-length integer.
				let q = delta;
				for (let k = base; /* no condition */; k += base) {
					const t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
					if (q < t) {
						break;
					}
					const qMinusT = q - t;
					const baseMinusT = base - t;
					output.push(
						stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
					);
					q = floor(qMinusT / baseMinusT);
				}

				output.push(stringFromCharCode(digitToBasic(q, 0)));
				bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
				delta = 0;
				++handledCPCount;
			}
		}

		++delta;
		++n;

	}
	return output.join('');
};

/**
 * Converts a Punycode string representing a domain name or an email address
 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
 * it doesn't matter if you call it on a string that has already been
 * converted to Unicode.
 * @memberOf punycode
 * @param {String} input The Punycoded domain name or email address to
 * convert to Unicode.
 * @returns {String} The Unicode representation of the given Punycode
 * string.
 */
const toUnicode = function(input) {
	return mapDomain(input, function(string) {
		return regexPunycode.test(string)
			? decode(string.slice(4).toLowerCase())
			: string;
	});
};

/**
 * Converts a Unicode string representing a domain name or an email address to
 * Punycode. Only the non-ASCII parts of the domain name will be converted,
 * i.e. it doesn't matter if you call it with a domain that's already in
 * ASCII.
 * @memberOf punycode
 * @param {String} input The domain name or email address to convert, as a
 * Unicode string.
 * @returns {String} The Punycode representation of the given domain name or
 * email address.
 */
const toASCII = function(input) {
	return mapDomain(input, function(string) {
		return regexNonASCII.test(string)
			? 'xn--' + encode(string)
			: string;
	});
};

/*--------------------------------------------------------------------------*/

/** Define the public API */
const punycode = {
	/**
	 * A string representing the current Punycode.js version number.
	 * @memberOf punycode
	 * @type String
	 */
	'version': '2.1.0',
	/**
	 * An object of methods to convert from JavaScript's internal character
	 * representation (UCS-2) to Unicode code points, and back.
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode
	 * @type Object
	 */
	'ucs2': {
		'decode': ucs2decode,
		'encode': ucs2encode
	},
	'decode': decode,
	'encode': encode,
	'toASCII': toASCII,
	'toUnicode': toUnicode
};


/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (punycode);


/***/ }),

/***/ 9413:
/***/ ((module) => {

module.exports=/[\0-\x1F\x7F-\x9F]/

/***/ }),

/***/ 2326:
/***/ ((module) => {

module.exports=/[\xAD\u0600-\u0605\u061C\u06DD\u070F\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/

/***/ }),

/***/ 3189:
/***/ ((module) => {

module.exports=/[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4E\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDF55-\uDF59]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9]|\uD805[\uDC4B-\uDC4F\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDF3C-\uDF3E]|\uD806[\uDC3B\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8]|\uD809[\uDC70-\uDC74]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDE97-\uDE9A]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD83A[\uDD5E\uDD5F]/

/***/ }),

/***/ 5045:
/***/ ((module) => {

module.exports=/[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/

/***/ }),

/***/ 4205:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


exports.Any = __webpack_require__(9369);
exports.Cc = __webpack_require__(9413);
exports.Cf = __webpack_require__(2326);
exports.P = __webpack_require__(3189);
exports.Z = __webpack_require__(5045);


/***/ }),

/***/ 9369:
/***/ ((module) => {

module.exports=/[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/

/***/ }),

/***/ 1201:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const State = __webpack_require__(5213);

/**
 * @namespace History
 * @property {Array}    history   Array of passages and previous state.
 * @property {number}   position  Current position in the array.
 */

class History {
  static history = [];
  static position = 0;
  /**
   * Add a passage name to the history array.
   *
   * @function add
   * @param {string} name - Name of the passage to add.
   */
  static add (name) {
    // Append to the end
    this.history.push({
      passageName: name,
      state: Object.assign({}, State.store)
    });

    // Reset the position to entry at the end.
    this.position = this.history.length - 1;
  }

  /**
   * Step back one index in the history array.
   *
   * @function undo
   * @returns {string | null} Name of now current passage; null if undo not possible.
   */
  static undo () {
    let result = null;

    if (this.position >= 1 && this.history.length >= 1) {
      // Decrease position
      this.position -= 1;
      // Find state.
      const state = this.history[this.position].state;
      // Have State update itself.
      State.updateState(state);
      // Return current passage name
      result = this.history[this.position].passageName;
    }

    return result;
  }

  /**
   * Step forward in history array, if possible.
   *
   * @function Redo
   * @returns {string | null} Name of now current passage; null if redo not possible.
   */
  static redo () {
    let result = null;

    if (this.position >= 0 && this.position < this.history.length - 1) {
      // Increase position
      this.position += 1;
      // Find state.
      const state = this.history[this.position].state;
      // Have State update itself.
      State.updateState(state);
      // Return current passage name
      result = this.history[this.position].passageName;
    }

    return result;
  }

  /**
   * Returns true if the named passage exists within the history array.
   *
   * @function hasVisited
   * @param {string | Array} passageName - Name(s) of passage to check.
   * @returns {boolean} True if passage(s) in history; false otherwise.
   */
  static hasVisited (passageName = null) {
    let result = false;

    if (Array.isArray(passageName)) {
      result = passageName.every((passageName) => {
        return this.history.some(entry => {
          return entry.passageName === passageName;
        });
      });
    } else {
      result = this.history.some((p) => {
        return p.passageName === passageName;
      });
    }

    return result;
  }

  /**
   * Returns number of visits for a single passage.
   *
   * @function visited
   * @param   {string} passageName  Passage name to check.
   * @returns {number}              Number of visits to passage.
   */
  static visited (passageName) {
    let searchResults = [];
    searchResults = this.history.filter(entry => entry.passageName === passageName);
    return searchResults.length;
  }

  /**
   * Resets History values to defaults.
   *
   * @function reset
   */
  static reset () {
    this.history = [];
    this.position = 0;
  }
}

module.exports = History;


/***/ }),

/***/ 9456:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const md = __webpack_require__(9980)({
  html: true, // Enable HTML tags in source
  xhtmlOut: true, // Use '/' to close single tags (<br />).
  breaks: true // Convert \n into <br />
});

class Markdown {
  static parse (text) {
    const rules = [
      // [[rename|destination][onclick]]
      [/\[\[(.*?)\|(.*?)\](?:\[(.*?)\])?\]/g, (m, p1, p2, p3 = '') => `<tw-link role="link" onclick="${p3.replaceAll('s.', 'window.Story.state.')}" data-passage="${p2}">${p1}</tw-link>`],
      // [[rename|destination]]
      // [/\[\[(.*?)\|(.*?)\]\]/g, '<tw-link role="link" data-passage="$2">$1</tw-link>'],
      // [[rename->dest][onclick]]
      [/\[\[(.*?)->(.*?)\](?:\[(.*?)\])?\]/g, (m, p1, p2, p3 = '') => `<tw-link role="link" onclick="${p3.replaceAll('s.', 'window.Story.state.')}" data-passage="${p2}">${p1}</tw-link>`],
      // [[rename->dest]]
      // [/\[\[(.*?)->(.*?)\]\]/g, '<tw-link role="link" data-passage="$2">$1</tw-link>'],
      // [[dest<-rename][onclick]]
      [/\[\[(.*?)<-(.*?)\](?:\[(.*?)\])?\]/g, (m, p1, p2, p3 = '') => `<tw-link role="link" onclick="${p3.replaceAll('s.', 'window.Story.state.')}" data-passage="${p1}">${p2}</tw-link>`],
      // [[dest<-rename]]
      // [/\[\[(.*?)<-(.*?)\]\]/g, '<tw-link role="link" data-passage="$1">$2</tw-link>'],
      // [[destination][onclick]]
      [/\[\[(.*?)\](?:\[(.*?)\])?\]/g, (m, p1, p2 = '') => `<tw-link role="link" onclick="${p2.replaceAll('s.', 'window.Story.state.')}" data-passage="${p1}">${p1}</tw-link>`]
      // [[destination]]
      // [/\[\[(.*?)\]\]/g, '<tw-link role="link" data-passage="$1">$1</tw-link>']
    ];

    rules.forEach(([rule, template]) => {
      text = text.replaceAll(rule, template);
    });

    return text;
  }

  static convert (text) {
    return md.render(text);
  }

  static unescape (text) {
    const unescapeSequences = [
      ['&amp;', '&'],
      ['&lt;', '<'],
      ['&gt;', '>'],
      ['&quot;', '"'],
      ['&#x27;', "'"],
      ['&#x60;', '`']
    ];

    unescapeSequences.forEach(([rule, template]) => {
      text = text.replaceAll(rule, template);
    });

    return text;
  }
}

module.exports = Markdown;


/***/ }),

/***/ 1067:
/***/ ((module) => {

/**
 * An object representing a passage. The current passage will be `window.passage`.
 *
 * @class Passage
 */

class Passage {
  constructor (name = 'Default', tags = [], source = '') {
    /**
     * @property {string} name - The name of passage
     * @type {string}
     */

    this.name = name;

    /**
     * @property {Array} tags - The tags of the passage.
     * @type {Array}
     */

    this.tags = tags;

    /**
     * @property {string} source - The passage source code.
     * @type {string}
     */

    this.source = source;
  }
}

module.exports = Passage;


/***/ }),

/***/ 1675:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const $ = __webpack_require__(9755);

class Screen {
  /**
   * Trigger screen-lock event.
   *
   * @function lock
   */
  static lock () {
    // Append an element filling screen with CSS loading spinner.
    $(document.body).append('<tw-screenlock><div class="loading"></div></tw-screenlock>');
  }

  /**
   * Trigger screen-unlock event.
   *
   * @function unlock
   */
  static unlock () {
    // Remove tw-screenlock element, if there is one.
    $('tw-screenlock').remove();
  }
}

module.exports = Screen;


/***/ }),

/***/ 5827:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const ejs = __webpack_require__(7083);
const History = __webpack_require__(1201);
const Screen = __webpack_require__(1675);
const Utilities = __webpack_require__(5543);

/**
 * @external Story
 * @see {@link Story}
 */

class Script {
  /**
   * Render JavaScript within a templated sandbox and return possible output.
   * Will throw error if code does.
   *
   * @function run
   * @param {string} script - Code to run.
   * @param {Story} story - Current story object.
   * @returns {string} Any output, if produced.
   */
  static run (script, story) {
    let result = '';

    try {
      // Send in pseudo-global properties.
      result = ejs.render(script,
        {
          s: story.store,
          Storage: story.storage,
          Storylets: story.storylets,
          History: {
            hasVisited: History.hasVisited.bind(History),
            visited: History.visited.bind(History),
            length: History.history.length
          },
          Screen: {
            lock: Screen.lock.bind(),
            unlock: Screen.unlock.bind()
          },
          Sidebar: {
            hide: story.sidebar.hide.bind(),
            show: story.sidebar.show.bind()
          },
          Utils: {
            delay: Utilities.delay.bind(),
            either: Utilities.either.bind(),
            applyExternalStyles: Utilities.applyExternalStyles.bind(),
            randomInt: Utilities.randomInt.bind()
          }
        },
        {
          outputFunctionName: 'print'
        }
      );
    } catch (e) {
      // Throw error if rendering fails.
      throw new Error(`Error compiling template code: ${e}`);
    }

    return result;
  }
}

module.exports = Script;


/***/ }),

/***/ 9906:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const $ = __webpack_require__(9755);
const State = __webpack_require__(5213);

class Sidebar {
  constructor () {
    /**
     * Reference to undo icon.
     *
     * @property {Element} undoIcon - Undo element.
     * @type {Element}
     */
    this.undoIcon = $('tw-icon[title="Undo"]');

    /**
     * Reference to redo icon.
     *
     * @property {Element} redoIcon - Redo element.
     * @type {Element}
     */
    this.redoIcon = $('tw-icon[title="Redo"]');

    // Listen for user click interactions.
    this.undoIcon.on('click', () => {
      // If undo is ever used, redo becomes available.
      this.showRedo();
      // Emit 'undo'
      State.events.emit('undo');
    });

    // Listen for user click interactions.
    this.redoIcon.on('click', () => {
      State.events.emit('redo');
    });

    // Start with undo hidden.
    this.hideUndo();

    // Start with redo hidden.
    this.hideRedo();
  }

  /**
   * Show undo icon.
   *
   * @function showUndo
   */
  showUndo () {
    this.undoIcon.css('visibility', 'visible');
  }

  /**
   * Hide undo icon.
   *
   * @function hideUndo
   */
  hideUndo () {
    this.undoIcon.css('visibility', 'hidden');
  }

  /**
   * Show redo icon.
   *
   * @function showRedo
   */
  showRedo () {
    this.redoIcon.css('visibility', 'visible');
  }

  /**
   * Hide redo icon.
   *
   * @function hideRedo
   */
  hideRedo () {
    this.redoIcon.css('visibility', 'hidden');
  }

  /**
   * Trigger undo event.
   *
   * @function undo
   */
  undo () {
    State.events.emit('undo');
  }

  /**
   * Trigger redo event.
   *
   * @function redo
   */
  redo () {
    State.events.emit('redo');
  }

  /**
   * Shows sidebar.
   *
   * @function show
   */
  show () {
    // Show tw-sidebar.
    $('tw-sidebar').css('visibility', 'visible');
  }

  /**
   * Hides sidebar.
   *
   * @function hide
   */
  hide () {
    // Hide tw-sidebar.
    $('tw-sidebar').css('visibility', 'hidden');
  }
}

module.exports = Sidebar;


/***/ }),

/***/ 5213:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const EventEmitter = __webpack_require__(7187);

const handler = {
  get: (target, property) => {
    return target[property];
  },
  set: (target, property, value) => {
    // Make change.
    target[property] = value;
    // Emit change.
    State.events.emit('change', property, value);
    // Return true.
    return true;
  },
  ownKeys (target) {
    return Object.keys(target);
  },
  has (target, prop) {
    return prop in target;
  },
  deleteProperty (target, prop) {
    // Set default.
    let result = false;

    // Test for inclusion as property.
    if (prop in target) {
      // Emit deletion event.
      State.events.emit('deletion', prop);
      // Delete via Reflection.
      result = Reflect.deleteProperty(target, prop);
    }

    // Return default or reflection result.
    return result;
  }
};

/**
 * @class State
 */
class State {
  static events = new EventEmitter();
  static store = new Proxy({}, handler);
  /**
   * Update current state properties to previous state values.
   *
   * @param {object} state - Object containing state properties.
   */
  static updateState (state) {
    for (const property in state) {
      this.store[property] = state[property];
    }
  }

  /**
   * Resets State properties to default values.
   */
  static reset () {
    this.events = new EventEmitter();
    this.store = new Proxy({}, handler);
  }
}

module.exports = State;


/***/ }),

/***/ 6505:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const History = __webpack_require__(1201);
const State = __webpack_require__(5213);

class Storage {
  /**
   * Remove save by name from the localStorage.
   *
   * @function removeSave
   * @param {string} save Name of save string.
   * @returns {boolean} True if remove was successful.
   */
  static removeSave (save = 'default') {
    let result = false;

    if (Storage.available()) {
      window.localStorage.removeItem(`${save}.snowman.history`);
      result = true;
    }

    return result;
  }

  /**
   * Returns if save string exists in localStorage
   *
   * @function doesSaveExist
   * @param {string} save Name of save string
   * @returns {boolean} True if save string exists
   */
  static doesSaveExist (save = 'default') {
    let history = null;

    if (Storage.available()) {
      history = window.localStorage.getItem(`${save}.snowman.history`);
    }

    return (history !== null);
  }

  /**
   * Save history using optional string prefix
   *
   * @function createSave
   * @param {string} save Optional name of save string
   * @returns {boolean} Returns true if save was successful
   */
  static createSave (save = 'default') {
    let result = false;

    if (Storage.available()) {
      window.localStorage.setItem(`${save}.snowman.history`, JSON.stringify(History.history));
      result = true;
    }

    return result;
  }

  /**
   * Attempts to restore the history and store based on optional save name
   *
   * @function restoreSave
   * @param {string} save Optional name of save string
   * @returns {boolean} Returns true if restore was successful
   */
  static restoreSave (save = 'default') {
    let history = null;
    let result = false;

    if (Storage.available()) {
      history = window.localStorage.getItem(`${save}.snowman.history`);
      result = true;
    }

    if (history !== null) {
      // Restore history
      History.history = JSON.parse(history);
      // Find current state.
      const state = History.history[History.position].state;
      // Have State update itself.
      State.updateState(state);
    }

    return result;
  }

  /**
   * Returns if localStorage is available or not in browser context.
   *
   * @function available
   * @returns {boolean} Returns true if localStorage can be used.
   */
  static available () {
    // Set default value to false.
    let result = false;

    try {
      window.localStorage.setItem('testKey', 'test');
      window.localStorage.removeItem('testKey');
      result = true;
    } catch (e) {
      // If an error was thrown, we do nothing.
      // The method will return false if it did not work.
    }

    // Return result
    return result;
  }

  /**
   * Clears localStorage, if available.
   *
   * @function removeAll
   * @returns {boolean} Returns true if removal was possible.
   */
  static removeAll () {
    // Set default value to false.
    let result = false;
    // Is localStorage available?
    if (Storage.available()) {
      // Clear the localStorage
      window.localStorage.clear();
      // Record result
      result = true;
    }
    // Return result
    return result;
  }
}

module.exports = Storage;


/***/ }),

/***/ 3213:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

/**
 * @external Element
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Element}
 */
const $ = __webpack_require__(9755);
const Passage = __webpack_require__(1067);
const Markdown = __webpack_require__(9456);
const State = __webpack_require__(5213);
const History = __webpack_require__(1201);
const Storylets = __webpack_require__(2444);
const Script = __webpack_require__(5827);
const Sidebar = __webpack_require__(9906);
const Screen = __webpack_require__(1675);
const Storage = __webpack_require__(6505);

/**
 * An object representing the entire story. After the document has completed
 * loading, an instance of this class will be available at `window.Story`.
 *
 * @class Story
 */
class Story {
  constructor () {
    /**
     * @property {string} name - The name of the story.
     * @type {string}
     * @readonly
     */
    this.name = $('tw-storydata').attr('name');

    /**
     * An array of all passages.
     *
     * @property {Array} passages - Passages array.
     * @type {Array}
     */
    this.passages = [];

    // For each child element of the `<tw-storydata>` element,
    //  create a new Passage object based on its attributes.
    $('tw-storydata').children('tw-passagedata').each((index, element) => {
      // Convert Element into jQuery Element.
      const elementReference = $(element);
      // Access any potential tags.
      let tags = elementReference.attr('tags');

      // Does the 'tags' attribute exist?
      if (tags !== '' && tags !== undefined) {
        // Attempt to split by space.
        tags = tags.split(' ');
      } else {
        // It did not exist, so we create it as an empty array.
        tags = [];
      }

      // Push the new passage.
      this.passages.push(new Passage(
        elementReference.attr('name'),
        tags,
        Markdown.unescape(elementReference.html())
      ));
    });

    /**
     * Passage element.
     *
     * @property {Element} passageElement Passage element.
     * @type {Element}
     */
    this.passageElement = $('tw-passage');

    /**
     * Sidebar.
     *
     * @property {Element} sidebar Sidebar instance.
     * @type {Element}
     */
    this.sidebar = new Sidebar();

    // Reset History.
    History.reset();

    /**
     * History reference.
     *
     * @property {History} history Reference to History.
     * @type {History}
     */
    this.history = History;

    /**
     * Screen reference.
     *
     * @property {Screen} screen Reference to Screen.
     * @type {Screen}
     */
    this.screen = Screen;

    /**
     * Storage reference.
     *
     * @property {Storage} screen Reference to Storage.
     * @type {Storage}
     */
    this.storage = Storage;

    // Reset State.
    State.reset();

    /**
     * State.events reference.
     *
     * @property {EventEmitter} events Reference to State.events.
     * @type {EventEmitter}
     */
    this.events = State.events;

    /**
     * State.store reference.
     *
     * @property {Proxy} store Reference to State.store.
     * @type {Proxy}
     */
    this.store = State.store;

    // Listen for redo events.
    State.events.on('redo', () => {
      // Attempt to redo history.
      const passageName = History.redo();
      // If redo failed, name will be null.
      if (passageName !== null) {
        // Check if at end of collection.
        if (History.position === History.history.length - 1) {
          // Hide redo.
          this.sidebar.hideRedo();
          // Show undo.
          this.sidebar.showUndo();
        }
        // Not null, show previous passage.
        this.show(passageName);
      }
    });

    // Listen for undo events.
    State.events.on('undo', () => {
      // Show redo if undo is clicked.
      this.sidebar.showRedo();
      // Attempt to undo history.
      const passageName = History.undo();
      // If undo failed, name will be null.
      if (passageName !== null) {
        // Check if at beginning of collection.
        if (History.position === 0) {
          // Hide undo
          this.sidebar.hideUndo();
        }
        // Not null, show previous passage.
        this.show(passageName);
      }
    });

    /**
     * The current passage.
     *
     * @property {Passage|null} currentPassage Currently showing passage, if any.
     * @type {Passage|null}
     */
    this.currentPassage = null;

    /**
     * Reference to internal Storylets object.
     *
     * Starts as null. During Story.start(), a new object is
     *  created based on initial passages.
     *
     * @property {Storylets} storylets Internal reference to Storylets
     * @type {Storylets|null}
     */
    this.storylets = null;
  }

  /**
   * Begins playing this story based on data from tw-storydata.
   * 1. Apply all user styles
   * 2. Run all user scripts
   * 3. Find starting passage
   * 4. Add to starting passage to History.history
   * 5. Show starting passage
   * 6. Trigger 'start' event
   *
   * @function start
   */
  start () {
    // Find all passages with the tag 'storylet'.
    const passageList = this.getPassagesByTag('storylet');
    // Generate initial Storylets collection.
    this.storylets = new Storylets(passageList);

    // For each Twine style, add them to the body as extra style elements.
    $('*[type="text/twine-css"]').each((index, element) => {
      // Convert from Element into jQuery Element.
      const twineStyleElement = $(element);
      // Append a new `<style>` with text from old.
      $(document.body).append(`<style>${twineStyleElement.text()}</style>`);
    });

    /**
     * Note: Browsers prevent error catching from scripts
     *  added after the initial loading.
     *
     * window.onerror will have error, but it cannot
     *  be caught.
     */
    $('*[type="text/twine-javascript"]').each((index, element) => {
      // Convert Element into jQuery Element.
      const twineScriptElement = $(element);
      // Create a new `<script>`.
      const newScriptElement = $('<script>');
      // Set the text of new from old.
      newScriptElement.text(twineScriptElement.text());
      // Append the new `<script>` with text to document body.
      $(document.body).append(newScriptElement);
    });

    // Get the startnode value (which is a number).
    const startingPassageID = parseInt($('tw-storydata').attr('startnode'));
    // Use the PID to find the name of the starting passage based on elements.
    const startPassage = $(`[pid="${startingPassageID}"]`).attr('name');
    // Search for the starting passage.
    const passage = this.getPassageByName(startPassage);

    // Does the starting passage exist?
    if (passage === null) {
      // It does not exist.
      // Throw an error.
      throw new Error('Starting passage does not exist!');
    }

    // Add to the history.
    History.add(passage.name);

    // Set the global passage to the one about to be shown.
    this.currentPassage = passage;

    // Overwrite current tags
    this.passageElement.attr('tags', passage.tags);

    // Get passage source.
    const passageSource = this.include(passage.name);

    // Overwrite the parsed with the rendered.
    this.passageElement.html(passageSource);

    // Listen for any reader clicking on `<tw-link>`.
    $('tw-link[data-passage]').on('click', (event) => {
      // Convert Element into jQuery Element.
      const jEl = $(event.target);
      // Retrieve data-passage value.
      const passageName = jEl.attr('data-passage');
      // Add to the history.
      History.add(passageName);
      // Hide the redo icon.
      this.sidebar.hideRedo();
      // Show the undo icon.
      this.sidebar.showUndo();
      // Show the passage by name.
      this.show(passageName);
    });

    /**
     * Triggered when the story starts.
     *
     * @event State#start
     * @type {string}
     */
    State.events.emit('start', passage.name);
  }

  /**
   * Returns an array of none, one, or many passages matching a specific tag.
   *
   * @function getPassagesByTag
   * @param {string} tag - Tag to search for.
   * @returns {Array} Array containing none, one, or many passage objects.
   */
  getPassagesByTag (tag) {
    // Search internal passages
    return this.passages.filter((p) => {
      return p.tags.includes(tag);
    });
  }

  /**
   * Returns a Passage object by name from internal collection. If none exists, returns null.
   * The Twine editor prevents multiple passages from having the same name, so
   *  this always returns the first search result.
   *
   * @function getPassageByName
   * @param {string} name - name of the passage
   * @returns {Passage|null} Passage object or null
   */
  getPassageByName (name) {
    // Create default value
    let passage = null;

    // Search for any passages with the name
    const result = this.passages.filter((p) => p.name === name);

    // Were any found?
    if (result.length !== 0) {
      // Grab the first result.
      passage = result[0];
    }

    // Return either null or first result found.
    return passage;
  }

  /**
   * Replaces current passage shown to reader with rendered source of named passage.
   * If the named passage does not exist, an error is thrown.
   *
   * @function show
   * @param {string} name name of the passage.
   */
  show (name) {
    // Look for passage by name.
    const passage = this.getPassageByName(name);

    // passage will be null if it was not found.
    if (passage === null) {
      // Passage was not found.
      // Throw error.
      throw new Error(`There is no passage with the name ${name}`);
    }

    // Set currentPassage to the one about to be shown.
    this.currentPassage = passage;

    // Overwrite current tags.
    this.passageElement.attr('tags', passage.tags);

    // Get passage source by name.
    const passageSource = this.include(passage.name);

    // Overwrite any existing HTML.
    this.passageElement.html(passageSource);

    // Listen for any reader clicking on `<tw-link>`.
    $('tw-link[data-passage]').on('click', (event) => {
      // Convert Element into jQuery Element.
      const jEl = $(event.target);
      // Retrieve data-passage value.
      const passageName = jEl.attr('data-passage');
      // Add to the history.
      History.add(passageName);
      // Hide the redo icon.
      this.sidebar.hideRedo();
      // Show the undo icon.
      this.sidebar.showUndo();
      // Show the passage by name.
      this.show(passageName);
    });

    /**
     * Triggered when a passage is shown.
     *
     * @event State#show
     * @type {string}
     */
    State.events.emit('show', passage.name);
  }

  /**
   * Returns the rendered source of a passage by name.
   *
   * @function include
   * @param {string} name - name of the passage.
   * @returns {string} Rendered passage source.
   */
  include (name) {
    // Search for passage by name.
    const passage = this.getPassageByName(name);

    // Does this passage exist?
    if (passage === null) {
      // It does not exist.
      // Throw error.
      throw new Error('There is no passage with name ' + name);
    }

    // Get passage source.
    let passageSource = passage.source;

    // Run any script.
    passageSource = Script.run(passageSource, this);

    // Parse any Markdown.
    passageSource = Markdown.parse(passageSource);

    // Run the Markdown conversion.
    passageSource = Markdown.convert(passageSource);

    // Return the passage source.
    return passageSource;
  }

  /**
   * Render a passage to any/all element(s) matching query selector
   *
   * @function renderPassageToSelector
   * @param {object} passageName - The passage to render
   * @param {string} selector - jQuery selector
   */
  renderPassageToSelector (passageName, selector) {
    // Get passage source
    const passageSource = this.include(passageName);

    // Replace the HTML of the selector (if valid).
    $(selector).html(passageSource);
  }

  /**
   * Add a new passage to the story.
   *
   * @function addPassage
   * @param {string} name name
   * @param {Array} tags tags
   * @param {string} source source
   */
  addPassage (name = '', tags = [], source = '') {
    // Look for name.
    const nameSearch = this.getPassageByName(name);

    // Confirm name does not already exist.
    if (nameSearch !== null) {
      throw new Error('Cannot add two passages with the same name!');
    }

    // Confirm tags is an array.
    if (!Array.isArray(tags)) {
      // Ignore and set to empty array.
      tags = [];
    }

    // Confirm if source is string.
    if (Object.prototype.toString.call(source) !== '[object String]') {
      // Ignore and set to empty string.
      source = '';
    }

    // Add to the existing passages.
    this.passages.push(new Passage(
      name,
      tags,
      Markdown.unescape(source)
    ));
  }

  /**
   * Remove a passage from the story internal collection.
   * Removing a passage and then attempting to visit the passage will
   * throw an error.
   *
   * Note: Does not affect HTML elements.
   *
   * @function removePassage
   * @param {string} name name
   */
  removePassage (name = '') {
    this.passages = this.passages.filter(passage => {
      return passage.name !== name;
    });
  }

  /**
   * Go to an existing passage in the story. Unlike `Story.show()`, this will add to the history.
   *
   * Throws error if passage does not exist.
   *
   * @function goto
   * @param {string} name name of passage
   */
  goto (name = '') {
    // Look for passage.
    const passage = this.getPassageByName(name);

    // Does passage exist?
    if (passage === null) {
      // Throw error.
      throw new Error(`There is no passage with the name ${name}`);
    }

    // Add to the history.
    History.add(name);

    // Hide the redo icon.
    this.sidebar.hideRedo();

    // Show the passage by name.
    this.show(name);
  }
}

module.exports = Story;


/***/ }),

/***/ 2444:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const { Query } = __webpack_require__(4406);
const State = __webpack_require__(5213);

/**
 * An object containing none, one, or multiple passages based
 *  on their use of the 'storylet' passage tag and `<requirements>` element.
 *
 * @class Storylets
 */
class Storylets {
  constructor (storyPassages = []) {
    // Internal array of passages.
    this.passages = [];

    // Is storyPassages an array?
    if (!Array.isArray(storyPassages)) {
      // If not, make it an empty array.
      storyPassages = [];
    }

    // For each, look for the <requirements> element in their source.
    for (const passageEntry of storyPassages) {
      // Double-check each object has a 'source' property.
      if (Object.prototype.hasOwnProperty.call(passageEntry, 'source')) {
        // Find the element and replace it with an empty string.
        const searchedSource = passageEntry.source.replace(/<requirements>([^>]*?)<\/requirements>/gmi, (match, captured) => {
          // Set a default object if JSON parsing fails.
          let passageRequirements = {};

          // Attempt JSON parsing, which can throw error on failure.
          try {
            // Try to parse string into object
            passageRequirements = JSON.parse(captured);
          } catch (e) {
            // Ignore the error
          }

          // Set default priority for all cards.
          let passagePriority = 0;

          // Look for priority property.
          // First, are there any keys?
          if (Object.keys(passageRequirements).length > 0) {
            // Second, does the 'priority' property exist?
            if (Object.prototype.hasOwnProperty.call(passageRequirements, 'priority')) {
              // Update priority.
              passagePriority = passageRequirements.priority;
              // Remove priority.
              delete passageRequirements.priority;
            }
          }

          // Add the passage to the internal array.
          this.passages.push(
            {
              passage: passageEntry,
              requirements: passageRequirements,
              priority: passagePriority
            }
          );

          // Return empty string, removing it from the passage source.
          return '';
        });

        // Overwrite previous source with removed <requirements> element.
        passageEntry.source = searchedSource;
      }
    }
  }

  /**
   * For each passage in the internal collection,
   *  test their requirements against State.store.
   *
   * Returns highest priority passages first.
   *
   * @function getAvailablePassages
   * @param {number} limit Number of passages to return
   * @returns {Array} Array of none, one, or many available passages.
   */
  getAvailablePassages (limit = 0) {
    // Create results array.
    let results = [];

    // Force argument into number.
    limit = parseInt(limit);

    // For each passage, test its requirements against State.store.
    this.passages.forEach(entry => {
      // Pull the requirements.
      const requirements = entry.requirements;
      // Create a query based on requirements.
      const query = new Query(requirements);
      // Test against State.store AND make sure there are search properties.
      // As requirements can be an empty object, we need to protect against it.
      if (query.test(State.store) && Object.keys(requirements).length > 0) {
        // Add the element to the results.
        results.push(entry);
      }
    });

    // Sort results by priority.
    results.sort((a, b) => b.priority - a.priority);

    // Slice the results based on limit argument.
    if (limit !== 0) {
      results = results.slice(0, limit);
    }

    // Return either all or sliced results.
    return results;
  }

  /**
   * Add a passage to the Storylets collection.
   *
   * @function addPassage
   * @param {string} newName Name of existing passage to add.
   * @param {object} newRequirements Requirements of passage.
   * @param {number} newPriority Priority of passage compared to other available.
   */
  addPassage (newName = '', newRequirements = {}, newPriority = 0) {
    // Check if passage exists in Story.
    const newPassage = window.Story.getPassageByName(newName);

    // If the passage was not found, throw an error.
    if (newPassage == null) {
      throw new Error('Passage must exist in Story to be added to Storylets collection');
    }

    // Test if passage exists in Storylets collection.
    if (this.includes(newName)) {
      throw new Error('Cannot add same passage twice to Storylets collection.');
    }

    // Verify newRequirements is an object.
    if (!(newRequirements && typeof newRequirements === 'object' && newRequirements.constructor === Object)) {
      // Ignore and set to empty object.
      newRequirements = {};
    }

    // Force parse newPriority into a number.
    newPriority = parseInt(newPriority);

    // Add the new, existing passage along with its requirements and priority.
    this.passages.push(
      {
        passage: newPassage,
        requirements: newRequirements,
        priority: newPriority
      }
    );
  }

  /**
   * Returns if Storylets collection already contains passage name or not.
   *
   * As passage names are unique to a story, the Storylets collection
   * cannot hold two entries with the same name.
   *
   * @function includes
   * @param {string} name Name of passage to search.
   * @returns {boolean} True if passage is in collection.
   */
  includes (name = '') {
    // Filter for passage name.
    const passageList = this.passages.filter((entry) => {
      return entry.passage.name === name;
    });

    // Return if passage was found.
    return (passageList.length > 0);
  }

  /**
   * Remove a passage from the collection by name.
   *
   * @function removePassage
   * @param {string} name Name of existing passage to remove.
   */
  removePassage (name = '') {
    this.passages = this.passages.filter((entry) => {
      return entry.passage.name !== name;
    });
  }
}

module.exports = Storylets;


/***/ }),

/***/ 5543:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const $ = __webpack_require__(9755);

class Utilities {
  /**
   * Accepts a function, wait, and optional set of arguments.
   * After the wait, the function will run with the passed arguments.
   *
   * @function delay
   * @param {Function}    func    Function to run.
   * @param {number}      wait    Number of milliseconds to wait.
   * @param {any}         [args]  Optional arguments to pass to the function.
   * @returns {number}            Identification of timer returned from setTimeout().
   */
  static delay (func, wait, ...args) {
    const boundFunction = func.bind(func);
    return setTimeout(boundFunction, wait, ...args);
  }

  /**
   * Accepts mixed input of arrays or comma-separated list of values and returns a random entry.
   * Will return null when given no arguments.
   *
   * Examples:
   * - either(1,2,3);
   * - either(1,[2],[4,5]);
   *
   * @function either
   * @param   {object|Array} args Array or comma-separated list.
   * @returns {object|null}       Random entry or null.
   */
  static either (...args) {
    let tempArray = [];
    let result = null;

    // For every entry...
    for (const entry of args) {
      // If it is not an array...
      if (!(entry instanceof Array)) {
        // push the entry into the temporary array.
        tempArray.push(entry);
      } else {
        // Spread out any subentries and add them to temporary array.
        tempArray = [...tempArray, ...entry];
      }
    }

    // Check if any entries were added.
    if (tempArray.length > 0) {
      // If they were, grab one of them.
      result = tempArray[Math.floor(Math.random() * tempArray.length)];
    }

    // Return either null (no entries) or random entry.
    return result;
  }

  /**
   * Applies external CSS files.
   *
   * @function applyExternalStyles
   * @param {Array} files Array of one or more external files to load.
   */
  static applyExternalStyles (files) {
    if (Array.isArray(files)) {
      files.forEach(location => {
        $('<link/>', {
          rel: 'stylesheet',
          type: 'text/css',
          href: location
        }).appendTo('head');
      });
    } else {
      throw new Error('Method only accepts an array!');
    }
  }

  /**
   * Return random integer within range.
   *
   * @function randomInt
   * @param   {number}  min   Start of range (default 0).
   * @param   {number}  max   End of range (default 0).
   * @returns {number}        Number in range.
   */
  static randomInt (min = 0, max = 0) {
    // Round up to min.
    min = Math.ceil(min);
    // Round down to max.
    max = Math.floor(max);

    // Is min greater than max?
    if (min > max) {
      max = min;
      min = 0;
    }

    return Math.floor(Math.random() * (max - min)) + min;
  }
}

module.exports = Utilities;


/***/ }),

/***/ 7790:
/***/ (() => {

/* (ignored) */

/***/ }),

/***/ 5272:
/***/ (() => {

/* (ignored) */

/***/ }),

/***/ 3558:
/***/ ((module) => {

"use strict";
module.exports = {"i8":"3.1.8"};

/***/ }),

/***/ 5485:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"Aacute":"Á","aacute":"á","Abreve":"Ă","abreve":"ă","ac":"∾","acd":"∿","acE":"∾̳","Acirc":"Â","acirc":"â","acute":"´","Acy":"А","acy":"а","AElig":"Æ","aelig":"æ","af":"⁡","Afr":"𝔄","afr":"𝔞","Agrave":"À","agrave":"à","alefsym":"ℵ","aleph":"ℵ","Alpha":"Α","alpha":"α","Amacr":"Ā","amacr":"ā","amalg":"⨿","amp":"&","AMP":"&","andand":"⩕","And":"⩓","and":"∧","andd":"⩜","andslope":"⩘","andv":"⩚","ang":"∠","ange":"⦤","angle":"∠","angmsdaa":"⦨","angmsdab":"⦩","angmsdac":"⦪","angmsdad":"⦫","angmsdae":"⦬","angmsdaf":"⦭","angmsdag":"⦮","angmsdah":"⦯","angmsd":"∡","angrt":"∟","angrtvb":"⊾","angrtvbd":"⦝","angsph":"∢","angst":"Å","angzarr":"⍼","Aogon":"Ą","aogon":"ą","Aopf":"𝔸","aopf":"𝕒","apacir":"⩯","ap":"≈","apE":"⩰","ape":"≊","apid":"≋","apos":"\'","ApplyFunction":"⁡","approx":"≈","approxeq":"≊","Aring":"Å","aring":"å","Ascr":"𝒜","ascr":"𝒶","Assign":"≔","ast":"*","asymp":"≈","asympeq":"≍","Atilde":"Ã","atilde":"ã","Auml":"Ä","auml":"ä","awconint":"∳","awint":"⨑","backcong":"≌","backepsilon":"϶","backprime":"‵","backsim":"∽","backsimeq":"⋍","Backslash":"∖","Barv":"⫧","barvee":"⊽","barwed":"⌅","Barwed":"⌆","barwedge":"⌅","bbrk":"⎵","bbrktbrk":"⎶","bcong":"≌","Bcy":"Б","bcy":"б","bdquo":"„","becaus":"∵","because":"∵","Because":"∵","bemptyv":"⦰","bepsi":"϶","bernou":"ℬ","Bernoullis":"ℬ","Beta":"Β","beta":"β","beth":"ℶ","between":"≬","Bfr":"𝔅","bfr":"𝔟","bigcap":"⋂","bigcirc":"◯","bigcup":"⋃","bigodot":"⨀","bigoplus":"⨁","bigotimes":"⨂","bigsqcup":"⨆","bigstar":"★","bigtriangledown":"▽","bigtriangleup":"△","biguplus":"⨄","bigvee":"⋁","bigwedge":"⋀","bkarow":"⤍","blacklozenge":"⧫","blacksquare":"▪","blacktriangle":"▴","blacktriangledown":"▾","blacktriangleleft":"◂","blacktriangleright":"▸","blank":"␣","blk12":"▒","blk14":"░","blk34":"▓","block":"█","bne":"=⃥","bnequiv":"≡⃥","bNot":"⫭","bnot":"⌐","Bopf":"𝔹","bopf":"𝕓","bot":"⊥","bottom":"⊥","bowtie":"⋈","boxbox":"⧉","boxdl":"┐","boxdL":"╕","boxDl":"╖","boxDL":"╗","boxdr":"┌","boxdR":"╒","boxDr":"╓","boxDR":"╔","boxh":"─","boxH":"═","boxhd":"┬","boxHd":"╤","boxhD":"╥","boxHD":"╦","boxhu":"┴","boxHu":"╧","boxhU":"╨","boxHU":"╩","boxminus":"⊟","boxplus":"⊞","boxtimes":"⊠","boxul":"┘","boxuL":"╛","boxUl":"╜","boxUL":"╝","boxur":"└","boxuR":"╘","boxUr":"╙","boxUR":"╚","boxv":"│","boxV":"║","boxvh":"┼","boxvH":"╪","boxVh":"╫","boxVH":"╬","boxvl":"┤","boxvL":"╡","boxVl":"╢","boxVL":"╣","boxvr":"├","boxvR":"╞","boxVr":"╟","boxVR":"╠","bprime":"‵","breve":"˘","Breve":"˘","brvbar":"¦","bscr":"𝒷","Bscr":"ℬ","bsemi":"⁏","bsim":"∽","bsime":"⋍","bsolb":"⧅","bsol":"\\\\","bsolhsub":"⟈","bull":"•","bullet":"•","bump":"≎","bumpE":"⪮","bumpe":"≏","Bumpeq":"≎","bumpeq":"≏","Cacute":"Ć","cacute":"ć","capand":"⩄","capbrcup":"⩉","capcap":"⩋","cap":"∩","Cap":"⋒","capcup":"⩇","capdot":"⩀","CapitalDifferentialD":"ⅅ","caps":"∩︀","caret":"⁁","caron":"ˇ","Cayleys":"ℭ","ccaps":"⩍","Ccaron":"Č","ccaron":"č","Ccedil":"Ç","ccedil":"ç","Ccirc":"Ĉ","ccirc":"ĉ","Cconint":"∰","ccups":"⩌","ccupssm":"⩐","Cdot":"Ċ","cdot":"ċ","cedil":"¸","Cedilla":"¸","cemptyv":"⦲","cent":"¢","centerdot":"·","CenterDot":"·","cfr":"𝔠","Cfr":"ℭ","CHcy":"Ч","chcy":"ч","check":"✓","checkmark":"✓","Chi":"Χ","chi":"χ","circ":"ˆ","circeq":"≗","circlearrowleft":"↺","circlearrowright":"↻","circledast":"⊛","circledcirc":"⊚","circleddash":"⊝","CircleDot":"⊙","circledR":"®","circledS":"Ⓢ","CircleMinus":"⊖","CirclePlus":"⊕","CircleTimes":"⊗","cir":"○","cirE":"⧃","cire":"≗","cirfnint":"⨐","cirmid":"⫯","cirscir":"⧂","ClockwiseContourIntegral":"∲","CloseCurlyDoubleQuote":"”","CloseCurlyQuote":"’","clubs":"♣","clubsuit":"♣","colon":":","Colon":"∷","Colone":"⩴","colone":"≔","coloneq":"≔","comma":",","commat":"@","comp":"∁","compfn":"∘","complement":"∁","complexes":"ℂ","cong":"≅","congdot":"⩭","Congruent":"≡","conint":"∮","Conint":"∯","ContourIntegral":"∮","copf":"𝕔","Copf":"ℂ","coprod":"∐","Coproduct":"∐","copy":"©","COPY":"©","copysr":"℗","CounterClockwiseContourIntegral":"∳","crarr":"↵","cross":"✗","Cross":"⨯","Cscr":"𝒞","cscr":"𝒸","csub":"⫏","csube":"⫑","csup":"⫐","csupe":"⫒","ctdot":"⋯","cudarrl":"⤸","cudarrr":"⤵","cuepr":"⋞","cuesc":"⋟","cularr":"↶","cularrp":"⤽","cupbrcap":"⩈","cupcap":"⩆","CupCap":"≍","cup":"∪","Cup":"⋓","cupcup":"⩊","cupdot":"⊍","cupor":"⩅","cups":"∪︀","curarr":"↷","curarrm":"⤼","curlyeqprec":"⋞","curlyeqsucc":"⋟","curlyvee":"⋎","curlywedge":"⋏","curren":"¤","curvearrowleft":"↶","curvearrowright":"↷","cuvee":"⋎","cuwed":"⋏","cwconint":"∲","cwint":"∱","cylcty":"⌭","dagger":"†","Dagger":"‡","daleth":"ℸ","darr":"↓","Darr":"↡","dArr":"⇓","dash":"‐","Dashv":"⫤","dashv":"⊣","dbkarow":"⤏","dblac":"˝","Dcaron":"Ď","dcaron":"ď","Dcy":"Д","dcy":"д","ddagger":"‡","ddarr":"⇊","DD":"ⅅ","dd":"ⅆ","DDotrahd":"⤑","ddotseq":"⩷","deg":"°","Del":"∇","Delta":"Δ","delta":"δ","demptyv":"⦱","dfisht":"⥿","Dfr":"𝔇","dfr":"𝔡","dHar":"⥥","dharl":"⇃","dharr":"⇂","DiacriticalAcute":"´","DiacriticalDot":"˙","DiacriticalDoubleAcute":"˝","DiacriticalGrave":"`","DiacriticalTilde":"˜","diam":"⋄","diamond":"⋄","Diamond":"⋄","diamondsuit":"♦","diams":"♦","die":"¨","DifferentialD":"ⅆ","digamma":"ϝ","disin":"⋲","div":"÷","divide":"÷","divideontimes":"⋇","divonx":"⋇","DJcy":"Ђ","djcy":"ђ","dlcorn":"⌞","dlcrop":"⌍","dollar":"$","Dopf":"𝔻","dopf":"𝕕","Dot":"¨","dot":"˙","DotDot":"⃜","doteq":"≐","doteqdot":"≑","DotEqual":"≐","dotminus":"∸","dotplus":"∔","dotsquare":"⊡","doublebarwedge":"⌆","DoubleContourIntegral":"∯","DoubleDot":"¨","DoubleDownArrow":"⇓","DoubleLeftArrow":"⇐","DoubleLeftRightArrow":"⇔","DoubleLeftTee":"⫤","DoubleLongLeftArrow":"⟸","DoubleLongLeftRightArrow":"⟺","DoubleLongRightArrow":"⟹","DoubleRightArrow":"⇒","DoubleRightTee":"⊨","DoubleUpArrow":"⇑","DoubleUpDownArrow":"⇕","DoubleVerticalBar":"∥","DownArrowBar":"⤓","downarrow":"↓","DownArrow":"↓","Downarrow":"⇓","DownArrowUpArrow":"⇵","DownBreve":"̑","downdownarrows":"⇊","downharpoonleft":"⇃","downharpoonright":"⇂","DownLeftRightVector":"⥐","DownLeftTeeVector":"⥞","DownLeftVectorBar":"⥖","DownLeftVector":"↽","DownRightTeeVector":"⥟","DownRightVectorBar":"⥗","DownRightVector":"⇁","DownTeeArrow":"↧","DownTee":"⊤","drbkarow":"⤐","drcorn":"⌟","drcrop":"⌌","Dscr":"𝒟","dscr":"𝒹","DScy":"Ѕ","dscy":"ѕ","dsol":"⧶","Dstrok":"Đ","dstrok":"đ","dtdot":"⋱","dtri":"▿","dtrif":"▾","duarr":"⇵","duhar":"⥯","dwangle":"⦦","DZcy":"Џ","dzcy":"џ","dzigrarr":"⟿","Eacute":"É","eacute":"é","easter":"⩮","Ecaron":"Ě","ecaron":"ě","Ecirc":"Ê","ecirc":"ê","ecir":"≖","ecolon":"≕","Ecy":"Э","ecy":"э","eDDot":"⩷","Edot":"Ė","edot":"ė","eDot":"≑","ee":"ⅇ","efDot":"≒","Efr":"𝔈","efr":"𝔢","eg":"⪚","Egrave":"È","egrave":"è","egs":"⪖","egsdot":"⪘","el":"⪙","Element":"∈","elinters":"⏧","ell":"ℓ","els":"⪕","elsdot":"⪗","Emacr":"Ē","emacr":"ē","empty":"∅","emptyset":"∅","EmptySmallSquare":"◻","emptyv":"∅","EmptyVerySmallSquare":"▫","emsp13":" ","emsp14":" ","emsp":" ","ENG":"Ŋ","eng":"ŋ","ensp":" ","Eogon":"Ę","eogon":"ę","Eopf":"𝔼","eopf":"𝕖","epar":"⋕","eparsl":"⧣","eplus":"⩱","epsi":"ε","Epsilon":"Ε","epsilon":"ε","epsiv":"ϵ","eqcirc":"≖","eqcolon":"≕","eqsim":"≂","eqslantgtr":"⪖","eqslantless":"⪕","Equal":"⩵","equals":"=","EqualTilde":"≂","equest":"≟","Equilibrium":"⇌","equiv":"≡","equivDD":"⩸","eqvparsl":"⧥","erarr":"⥱","erDot":"≓","escr":"ℯ","Escr":"ℰ","esdot":"≐","Esim":"⩳","esim":"≂","Eta":"Η","eta":"η","ETH":"Ð","eth":"ð","Euml":"Ë","euml":"ë","euro":"€","excl":"!","exist":"∃","Exists":"∃","expectation":"ℰ","exponentiale":"ⅇ","ExponentialE":"ⅇ","fallingdotseq":"≒","Fcy":"Ф","fcy":"ф","female":"♀","ffilig":"ﬃ","fflig":"ﬀ","ffllig":"ﬄ","Ffr":"𝔉","ffr":"𝔣","filig":"ﬁ","FilledSmallSquare":"◼","FilledVerySmallSquare":"▪","fjlig":"fj","flat":"♭","fllig":"ﬂ","fltns":"▱","fnof":"ƒ","Fopf":"𝔽","fopf":"𝕗","forall":"∀","ForAll":"∀","fork":"⋔","forkv":"⫙","Fouriertrf":"ℱ","fpartint":"⨍","frac12":"½","frac13":"⅓","frac14":"¼","frac15":"⅕","frac16":"⅙","frac18":"⅛","frac23":"⅔","frac25":"⅖","frac34":"¾","frac35":"⅗","frac38":"⅜","frac45":"⅘","frac56":"⅚","frac58":"⅝","frac78":"⅞","frasl":"⁄","frown":"⌢","fscr":"𝒻","Fscr":"ℱ","gacute":"ǵ","Gamma":"Γ","gamma":"γ","Gammad":"Ϝ","gammad":"ϝ","gap":"⪆","Gbreve":"Ğ","gbreve":"ğ","Gcedil":"Ģ","Gcirc":"Ĝ","gcirc":"ĝ","Gcy":"Г","gcy":"г","Gdot":"Ġ","gdot":"ġ","ge":"≥","gE":"≧","gEl":"⪌","gel":"⋛","geq":"≥","geqq":"≧","geqslant":"⩾","gescc":"⪩","ges":"⩾","gesdot":"⪀","gesdoto":"⪂","gesdotol":"⪄","gesl":"⋛︀","gesles":"⪔","Gfr":"𝔊","gfr":"𝔤","gg":"≫","Gg":"⋙","ggg":"⋙","gimel":"ℷ","GJcy":"Ѓ","gjcy":"ѓ","gla":"⪥","gl":"≷","glE":"⪒","glj":"⪤","gnap":"⪊","gnapprox":"⪊","gne":"⪈","gnE":"≩","gneq":"⪈","gneqq":"≩","gnsim":"⋧","Gopf":"𝔾","gopf":"𝕘","grave":"`","GreaterEqual":"≥","GreaterEqualLess":"⋛","GreaterFullEqual":"≧","GreaterGreater":"⪢","GreaterLess":"≷","GreaterSlantEqual":"⩾","GreaterTilde":"≳","Gscr":"𝒢","gscr":"ℊ","gsim":"≳","gsime":"⪎","gsiml":"⪐","gtcc":"⪧","gtcir":"⩺","gt":">","GT":">","Gt":"≫","gtdot":"⋗","gtlPar":"⦕","gtquest":"⩼","gtrapprox":"⪆","gtrarr":"⥸","gtrdot":"⋗","gtreqless":"⋛","gtreqqless":"⪌","gtrless":"≷","gtrsim":"≳","gvertneqq":"≩︀","gvnE":"≩︀","Hacek":"ˇ","hairsp":" ","half":"½","hamilt":"ℋ","HARDcy":"Ъ","hardcy":"ъ","harrcir":"⥈","harr":"↔","hArr":"⇔","harrw":"↭","Hat":"^","hbar":"ℏ","Hcirc":"Ĥ","hcirc":"ĥ","hearts":"♥","heartsuit":"♥","hellip":"…","hercon":"⊹","hfr":"𝔥","Hfr":"ℌ","HilbertSpace":"ℋ","hksearow":"⤥","hkswarow":"⤦","hoarr":"⇿","homtht":"∻","hookleftarrow":"↩","hookrightarrow":"↪","hopf":"𝕙","Hopf":"ℍ","horbar":"―","HorizontalLine":"─","hscr":"𝒽","Hscr":"ℋ","hslash":"ℏ","Hstrok":"Ħ","hstrok":"ħ","HumpDownHump":"≎","HumpEqual":"≏","hybull":"⁃","hyphen":"‐","Iacute":"Í","iacute":"í","ic":"⁣","Icirc":"Î","icirc":"î","Icy":"И","icy":"и","Idot":"İ","IEcy":"Е","iecy":"е","iexcl":"¡","iff":"⇔","ifr":"𝔦","Ifr":"ℑ","Igrave":"Ì","igrave":"ì","ii":"ⅈ","iiiint":"⨌","iiint":"∭","iinfin":"⧜","iiota":"℩","IJlig":"Ĳ","ijlig":"ĳ","Imacr":"Ī","imacr":"ī","image":"ℑ","ImaginaryI":"ⅈ","imagline":"ℐ","imagpart":"ℑ","imath":"ı","Im":"ℑ","imof":"⊷","imped":"Ƶ","Implies":"⇒","incare":"℅","in":"∈","infin":"∞","infintie":"⧝","inodot":"ı","intcal":"⊺","int":"∫","Int":"∬","integers":"ℤ","Integral":"∫","intercal":"⊺","Intersection":"⋂","intlarhk":"⨗","intprod":"⨼","InvisibleComma":"⁣","InvisibleTimes":"⁢","IOcy":"Ё","iocy":"ё","Iogon":"Į","iogon":"į","Iopf":"𝕀","iopf":"𝕚","Iota":"Ι","iota":"ι","iprod":"⨼","iquest":"¿","iscr":"𝒾","Iscr":"ℐ","isin":"∈","isindot":"⋵","isinE":"⋹","isins":"⋴","isinsv":"⋳","isinv":"∈","it":"⁢","Itilde":"Ĩ","itilde":"ĩ","Iukcy":"І","iukcy":"і","Iuml":"Ï","iuml":"ï","Jcirc":"Ĵ","jcirc":"ĵ","Jcy":"Й","jcy":"й","Jfr":"𝔍","jfr":"𝔧","jmath":"ȷ","Jopf":"𝕁","jopf":"𝕛","Jscr":"𝒥","jscr":"𝒿","Jsercy":"Ј","jsercy":"ј","Jukcy":"Є","jukcy":"є","Kappa":"Κ","kappa":"κ","kappav":"ϰ","Kcedil":"Ķ","kcedil":"ķ","Kcy":"К","kcy":"к","Kfr":"𝔎","kfr":"𝔨","kgreen":"ĸ","KHcy":"Х","khcy":"х","KJcy":"Ќ","kjcy":"ќ","Kopf":"𝕂","kopf":"𝕜","Kscr":"𝒦","kscr":"𝓀","lAarr":"⇚","Lacute":"Ĺ","lacute":"ĺ","laemptyv":"⦴","lagran":"ℒ","Lambda":"Λ","lambda":"λ","lang":"⟨","Lang":"⟪","langd":"⦑","langle":"⟨","lap":"⪅","Laplacetrf":"ℒ","laquo":"«","larrb":"⇤","larrbfs":"⤟","larr":"←","Larr":"↞","lArr":"⇐","larrfs":"⤝","larrhk":"↩","larrlp":"↫","larrpl":"⤹","larrsim":"⥳","larrtl":"↢","latail":"⤙","lAtail":"⤛","lat":"⪫","late":"⪭","lates":"⪭︀","lbarr":"⤌","lBarr":"⤎","lbbrk":"❲","lbrace":"{","lbrack":"[","lbrke":"⦋","lbrksld":"⦏","lbrkslu":"⦍","Lcaron":"Ľ","lcaron":"ľ","Lcedil":"Ļ","lcedil":"ļ","lceil":"⌈","lcub":"{","Lcy":"Л","lcy":"л","ldca":"⤶","ldquo":"“","ldquor":"„","ldrdhar":"⥧","ldrushar":"⥋","ldsh":"↲","le":"≤","lE":"≦","LeftAngleBracket":"⟨","LeftArrowBar":"⇤","leftarrow":"←","LeftArrow":"←","Leftarrow":"⇐","LeftArrowRightArrow":"⇆","leftarrowtail":"↢","LeftCeiling":"⌈","LeftDoubleBracket":"⟦","LeftDownTeeVector":"⥡","LeftDownVectorBar":"⥙","LeftDownVector":"⇃","LeftFloor":"⌊","leftharpoondown":"↽","leftharpoonup":"↼","leftleftarrows":"⇇","leftrightarrow":"↔","LeftRightArrow":"↔","Leftrightarrow":"⇔","leftrightarrows":"⇆","leftrightharpoons":"⇋","leftrightsquigarrow":"↭","LeftRightVector":"⥎","LeftTeeArrow":"↤","LeftTee":"⊣","LeftTeeVector":"⥚","leftthreetimes":"⋋","LeftTriangleBar":"⧏","LeftTriangle":"⊲","LeftTriangleEqual":"⊴","LeftUpDownVector":"⥑","LeftUpTeeVector":"⥠","LeftUpVectorBar":"⥘","LeftUpVector":"↿","LeftVectorBar":"⥒","LeftVector":"↼","lEg":"⪋","leg":"⋚","leq":"≤","leqq":"≦","leqslant":"⩽","lescc":"⪨","les":"⩽","lesdot":"⩿","lesdoto":"⪁","lesdotor":"⪃","lesg":"⋚︀","lesges":"⪓","lessapprox":"⪅","lessdot":"⋖","lesseqgtr":"⋚","lesseqqgtr":"⪋","LessEqualGreater":"⋚","LessFullEqual":"≦","LessGreater":"≶","lessgtr":"≶","LessLess":"⪡","lesssim":"≲","LessSlantEqual":"⩽","LessTilde":"≲","lfisht":"⥼","lfloor":"⌊","Lfr":"𝔏","lfr":"𝔩","lg":"≶","lgE":"⪑","lHar":"⥢","lhard":"↽","lharu":"↼","lharul":"⥪","lhblk":"▄","LJcy":"Љ","ljcy":"љ","llarr":"⇇","ll":"≪","Ll":"⋘","llcorner":"⌞","Lleftarrow":"⇚","llhard":"⥫","lltri":"◺","Lmidot":"Ŀ","lmidot":"ŀ","lmoustache":"⎰","lmoust":"⎰","lnap":"⪉","lnapprox":"⪉","lne":"⪇","lnE":"≨","lneq":"⪇","lneqq":"≨","lnsim":"⋦","loang":"⟬","loarr":"⇽","lobrk":"⟦","longleftarrow":"⟵","LongLeftArrow":"⟵","Longleftarrow":"⟸","longleftrightarrow":"⟷","LongLeftRightArrow":"⟷","Longleftrightarrow":"⟺","longmapsto":"⟼","longrightarrow":"⟶","LongRightArrow":"⟶","Longrightarrow":"⟹","looparrowleft":"↫","looparrowright":"↬","lopar":"⦅","Lopf":"𝕃","lopf":"𝕝","loplus":"⨭","lotimes":"⨴","lowast":"∗","lowbar":"_","LowerLeftArrow":"↙","LowerRightArrow":"↘","loz":"◊","lozenge":"◊","lozf":"⧫","lpar":"(","lparlt":"⦓","lrarr":"⇆","lrcorner":"⌟","lrhar":"⇋","lrhard":"⥭","lrm":"‎","lrtri":"⊿","lsaquo":"‹","lscr":"𝓁","Lscr":"ℒ","lsh":"↰","Lsh":"↰","lsim":"≲","lsime":"⪍","lsimg":"⪏","lsqb":"[","lsquo":"‘","lsquor":"‚","Lstrok":"Ł","lstrok":"ł","ltcc":"⪦","ltcir":"⩹","lt":"<","LT":"<","Lt":"≪","ltdot":"⋖","lthree":"⋋","ltimes":"⋉","ltlarr":"⥶","ltquest":"⩻","ltri":"◃","ltrie":"⊴","ltrif":"◂","ltrPar":"⦖","lurdshar":"⥊","luruhar":"⥦","lvertneqq":"≨︀","lvnE":"≨︀","macr":"¯","male":"♂","malt":"✠","maltese":"✠","Map":"⤅","map":"↦","mapsto":"↦","mapstodown":"↧","mapstoleft":"↤","mapstoup":"↥","marker":"▮","mcomma":"⨩","Mcy":"М","mcy":"м","mdash":"—","mDDot":"∺","measuredangle":"∡","MediumSpace":" ","Mellintrf":"ℳ","Mfr":"𝔐","mfr":"𝔪","mho":"℧","micro":"µ","midast":"*","midcir":"⫰","mid":"∣","middot":"·","minusb":"⊟","minus":"−","minusd":"∸","minusdu":"⨪","MinusPlus":"∓","mlcp":"⫛","mldr":"…","mnplus":"∓","models":"⊧","Mopf":"𝕄","mopf":"𝕞","mp":"∓","mscr":"𝓂","Mscr":"ℳ","mstpos":"∾","Mu":"Μ","mu":"μ","multimap":"⊸","mumap":"⊸","nabla":"∇","Nacute":"Ń","nacute":"ń","nang":"∠⃒","nap":"≉","napE":"⩰̸","napid":"≋̸","napos":"ŉ","napprox":"≉","natural":"♮","naturals":"ℕ","natur":"♮","nbsp":" ","nbump":"≎̸","nbumpe":"≏̸","ncap":"⩃","Ncaron":"Ň","ncaron":"ň","Ncedil":"Ņ","ncedil":"ņ","ncong":"≇","ncongdot":"⩭̸","ncup":"⩂","Ncy":"Н","ncy":"н","ndash":"–","nearhk":"⤤","nearr":"↗","neArr":"⇗","nearrow":"↗","ne":"≠","nedot":"≐̸","NegativeMediumSpace":"​","NegativeThickSpace":"​","NegativeThinSpace":"​","NegativeVeryThinSpace":"​","nequiv":"≢","nesear":"⤨","nesim":"≂̸","NestedGreaterGreater":"≫","NestedLessLess":"≪","NewLine":"\\n","nexist":"∄","nexists":"∄","Nfr":"𝔑","nfr":"𝔫","ngE":"≧̸","nge":"≱","ngeq":"≱","ngeqq":"≧̸","ngeqslant":"⩾̸","nges":"⩾̸","nGg":"⋙̸","ngsim":"≵","nGt":"≫⃒","ngt":"≯","ngtr":"≯","nGtv":"≫̸","nharr":"↮","nhArr":"⇎","nhpar":"⫲","ni":"∋","nis":"⋼","nisd":"⋺","niv":"∋","NJcy":"Њ","njcy":"њ","nlarr":"↚","nlArr":"⇍","nldr":"‥","nlE":"≦̸","nle":"≰","nleftarrow":"↚","nLeftarrow":"⇍","nleftrightarrow":"↮","nLeftrightarrow":"⇎","nleq":"≰","nleqq":"≦̸","nleqslant":"⩽̸","nles":"⩽̸","nless":"≮","nLl":"⋘̸","nlsim":"≴","nLt":"≪⃒","nlt":"≮","nltri":"⋪","nltrie":"⋬","nLtv":"≪̸","nmid":"∤","NoBreak":"⁠","NonBreakingSpace":" ","nopf":"𝕟","Nopf":"ℕ","Not":"⫬","not":"¬","NotCongruent":"≢","NotCupCap":"≭","NotDoubleVerticalBar":"∦","NotElement":"∉","NotEqual":"≠","NotEqualTilde":"≂̸","NotExists":"∄","NotGreater":"≯","NotGreaterEqual":"≱","NotGreaterFullEqual":"≧̸","NotGreaterGreater":"≫̸","NotGreaterLess":"≹","NotGreaterSlantEqual":"⩾̸","NotGreaterTilde":"≵","NotHumpDownHump":"≎̸","NotHumpEqual":"≏̸","notin":"∉","notindot":"⋵̸","notinE":"⋹̸","notinva":"∉","notinvb":"⋷","notinvc":"⋶","NotLeftTriangleBar":"⧏̸","NotLeftTriangle":"⋪","NotLeftTriangleEqual":"⋬","NotLess":"≮","NotLessEqual":"≰","NotLessGreater":"≸","NotLessLess":"≪̸","NotLessSlantEqual":"⩽̸","NotLessTilde":"≴","NotNestedGreaterGreater":"⪢̸","NotNestedLessLess":"⪡̸","notni":"∌","notniva":"∌","notnivb":"⋾","notnivc":"⋽","NotPrecedes":"⊀","NotPrecedesEqual":"⪯̸","NotPrecedesSlantEqual":"⋠","NotReverseElement":"∌","NotRightTriangleBar":"⧐̸","NotRightTriangle":"⋫","NotRightTriangleEqual":"⋭","NotSquareSubset":"⊏̸","NotSquareSubsetEqual":"⋢","NotSquareSuperset":"⊐̸","NotSquareSupersetEqual":"⋣","NotSubset":"⊂⃒","NotSubsetEqual":"⊈","NotSucceeds":"⊁","NotSucceedsEqual":"⪰̸","NotSucceedsSlantEqual":"⋡","NotSucceedsTilde":"≿̸","NotSuperset":"⊃⃒","NotSupersetEqual":"⊉","NotTilde":"≁","NotTildeEqual":"≄","NotTildeFullEqual":"≇","NotTildeTilde":"≉","NotVerticalBar":"∤","nparallel":"∦","npar":"∦","nparsl":"⫽⃥","npart":"∂̸","npolint":"⨔","npr":"⊀","nprcue":"⋠","nprec":"⊀","npreceq":"⪯̸","npre":"⪯̸","nrarrc":"⤳̸","nrarr":"↛","nrArr":"⇏","nrarrw":"↝̸","nrightarrow":"↛","nRightarrow":"⇏","nrtri":"⋫","nrtrie":"⋭","nsc":"⊁","nsccue":"⋡","nsce":"⪰̸","Nscr":"𝒩","nscr":"𝓃","nshortmid":"∤","nshortparallel":"∦","nsim":"≁","nsime":"≄","nsimeq":"≄","nsmid":"∤","nspar":"∦","nsqsube":"⋢","nsqsupe":"⋣","nsub":"⊄","nsubE":"⫅̸","nsube":"⊈","nsubset":"⊂⃒","nsubseteq":"⊈","nsubseteqq":"⫅̸","nsucc":"⊁","nsucceq":"⪰̸","nsup":"⊅","nsupE":"⫆̸","nsupe":"⊉","nsupset":"⊃⃒","nsupseteq":"⊉","nsupseteqq":"⫆̸","ntgl":"≹","Ntilde":"Ñ","ntilde":"ñ","ntlg":"≸","ntriangleleft":"⋪","ntrianglelefteq":"⋬","ntriangleright":"⋫","ntrianglerighteq":"⋭","Nu":"Ν","nu":"ν","num":"#","numero":"№","numsp":" ","nvap":"≍⃒","nvdash":"⊬","nvDash":"⊭","nVdash":"⊮","nVDash":"⊯","nvge":"≥⃒","nvgt":">⃒","nvHarr":"⤄","nvinfin":"⧞","nvlArr":"⤂","nvle":"≤⃒","nvlt":"<⃒","nvltrie":"⊴⃒","nvrArr":"⤃","nvrtrie":"⊵⃒","nvsim":"∼⃒","nwarhk":"⤣","nwarr":"↖","nwArr":"⇖","nwarrow":"↖","nwnear":"⤧","Oacute":"Ó","oacute":"ó","oast":"⊛","Ocirc":"Ô","ocirc":"ô","ocir":"⊚","Ocy":"О","ocy":"о","odash":"⊝","Odblac":"Ő","odblac":"ő","odiv":"⨸","odot":"⊙","odsold":"⦼","OElig":"Œ","oelig":"œ","ofcir":"⦿","Ofr":"𝔒","ofr":"𝔬","ogon":"˛","Ograve":"Ò","ograve":"ò","ogt":"⧁","ohbar":"⦵","ohm":"Ω","oint":"∮","olarr":"↺","olcir":"⦾","olcross":"⦻","oline":"‾","olt":"⧀","Omacr":"Ō","omacr":"ō","Omega":"Ω","omega":"ω","Omicron":"Ο","omicron":"ο","omid":"⦶","ominus":"⊖","Oopf":"𝕆","oopf":"𝕠","opar":"⦷","OpenCurlyDoubleQuote":"“","OpenCurlyQuote":"‘","operp":"⦹","oplus":"⊕","orarr":"↻","Or":"⩔","or":"∨","ord":"⩝","order":"ℴ","orderof":"ℴ","ordf":"ª","ordm":"º","origof":"⊶","oror":"⩖","orslope":"⩗","orv":"⩛","oS":"Ⓢ","Oscr":"𝒪","oscr":"ℴ","Oslash":"Ø","oslash":"ø","osol":"⊘","Otilde":"Õ","otilde":"õ","otimesas":"⨶","Otimes":"⨷","otimes":"⊗","Ouml":"Ö","ouml":"ö","ovbar":"⌽","OverBar":"‾","OverBrace":"⏞","OverBracket":"⎴","OverParenthesis":"⏜","para":"¶","parallel":"∥","par":"∥","parsim":"⫳","parsl":"⫽","part":"∂","PartialD":"∂","Pcy":"П","pcy":"п","percnt":"%","period":".","permil":"‰","perp":"⊥","pertenk":"‱","Pfr":"𝔓","pfr":"𝔭","Phi":"Φ","phi":"φ","phiv":"ϕ","phmmat":"ℳ","phone":"☎","Pi":"Π","pi":"π","pitchfork":"⋔","piv":"ϖ","planck":"ℏ","planckh":"ℎ","plankv":"ℏ","plusacir":"⨣","plusb":"⊞","pluscir":"⨢","plus":"+","plusdo":"∔","plusdu":"⨥","pluse":"⩲","PlusMinus":"±","plusmn":"±","plussim":"⨦","plustwo":"⨧","pm":"±","Poincareplane":"ℌ","pointint":"⨕","popf":"𝕡","Popf":"ℙ","pound":"£","prap":"⪷","Pr":"⪻","pr":"≺","prcue":"≼","precapprox":"⪷","prec":"≺","preccurlyeq":"≼","Precedes":"≺","PrecedesEqual":"⪯","PrecedesSlantEqual":"≼","PrecedesTilde":"≾","preceq":"⪯","precnapprox":"⪹","precneqq":"⪵","precnsim":"⋨","pre":"⪯","prE":"⪳","precsim":"≾","prime":"′","Prime":"″","primes":"ℙ","prnap":"⪹","prnE":"⪵","prnsim":"⋨","prod":"∏","Product":"∏","profalar":"⌮","profline":"⌒","profsurf":"⌓","prop":"∝","Proportional":"∝","Proportion":"∷","propto":"∝","prsim":"≾","prurel":"⊰","Pscr":"𝒫","pscr":"𝓅","Psi":"Ψ","psi":"ψ","puncsp":" ","Qfr":"𝔔","qfr":"𝔮","qint":"⨌","qopf":"𝕢","Qopf":"ℚ","qprime":"⁗","Qscr":"𝒬","qscr":"𝓆","quaternions":"ℍ","quatint":"⨖","quest":"?","questeq":"≟","quot":"\\"","QUOT":"\\"","rAarr":"⇛","race":"∽̱","Racute":"Ŕ","racute":"ŕ","radic":"√","raemptyv":"⦳","rang":"⟩","Rang":"⟫","rangd":"⦒","range":"⦥","rangle":"⟩","raquo":"»","rarrap":"⥵","rarrb":"⇥","rarrbfs":"⤠","rarrc":"⤳","rarr":"→","Rarr":"↠","rArr":"⇒","rarrfs":"⤞","rarrhk":"↪","rarrlp":"↬","rarrpl":"⥅","rarrsim":"⥴","Rarrtl":"⤖","rarrtl":"↣","rarrw":"↝","ratail":"⤚","rAtail":"⤜","ratio":"∶","rationals":"ℚ","rbarr":"⤍","rBarr":"⤏","RBarr":"⤐","rbbrk":"❳","rbrace":"}","rbrack":"]","rbrke":"⦌","rbrksld":"⦎","rbrkslu":"⦐","Rcaron":"Ř","rcaron":"ř","Rcedil":"Ŗ","rcedil":"ŗ","rceil":"⌉","rcub":"}","Rcy":"Р","rcy":"р","rdca":"⤷","rdldhar":"⥩","rdquo":"”","rdquor":"”","rdsh":"↳","real":"ℜ","realine":"ℛ","realpart":"ℜ","reals":"ℝ","Re":"ℜ","rect":"▭","reg":"®","REG":"®","ReverseElement":"∋","ReverseEquilibrium":"⇋","ReverseUpEquilibrium":"⥯","rfisht":"⥽","rfloor":"⌋","rfr":"𝔯","Rfr":"ℜ","rHar":"⥤","rhard":"⇁","rharu":"⇀","rharul":"⥬","Rho":"Ρ","rho":"ρ","rhov":"ϱ","RightAngleBracket":"⟩","RightArrowBar":"⇥","rightarrow":"→","RightArrow":"→","Rightarrow":"⇒","RightArrowLeftArrow":"⇄","rightarrowtail":"↣","RightCeiling":"⌉","RightDoubleBracket":"⟧","RightDownTeeVector":"⥝","RightDownVectorBar":"⥕","RightDownVector":"⇂","RightFloor":"⌋","rightharpoondown":"⇁","rightharpoonup":"⇀","rightleftarrows":"⇄","rightleftharpoons":"⇌","rightrightarrows":"⇉","rightsquigarrow":"↝","RightTeeArrow":"↦","RightTee":"⊢","RightTeeVector":"⥛","rightthreetimes":"⋌","RightTriangleBar":"⧐","RightTriangle":"⊳","RightTriangleEqual":"⊵","RightUpDownVector":"⥏","RightUpTeeVector":"⥜","RightUpVectorBar":"⥔","RightUpVector":"↾","RightVectorBar":"⥓","RightVector":"⇀","ring":"˚","risingdotseq":"≓","rlarr":"⇄","rlhar":"⇌","rlm":"‏","rmoustache":"⎱","rmoust":"⎱","rnmid":"⫮","roang":"⟭","roarr":"⇾","robrk":"⟧","ropar":"⦆","ropf":"𝕣","Ropf":"ℝ","roplus":"⨮","rotimes":"⨵","RoundImplies":"⥰","rpar":")","rpargt":"⦔","rppolint":"⨒","rrarr":"⇉","Rrightarrow":"⇛","rsaquo":"›","rscr":"𝓇","Rscr":"ℛ","rsh":"↱","Rsh":"↱","rsqb":"]","rsquo":"’","rsquor":"’","rthree":"⋌","rtimes":"⋊","rtri":"▹","rtrie":"⊵","rtrif":"▸","rtriltri":"⧎","RuleDelayed":"⧴","ruluhar":"⥨","rx":"℞","Sacute":"Ś","sacute":"ś","sbquo":"‚","scap":"⪸","Scaron":"Š","scaron":"š","Sc":"⪼","sc":"≻","sccue":"≽","sce":"⪰","scE":"⪴","Scedil":"Ş","scedil":"ş","Scirc":"Ŝ","scirc":"ŝ","scnap":"⪺","scnE":"⪶","scnsim":"⋩","scpolint":"⨓","scsim":"≿","Scy":"С","scy":"с","sdotb":"⊡","sdot":"⋅","sdote":"⩦","searhk":"⤥","searr":"↘","seArr":"⇘","searrow":"↘","sect":"§","semi":";","seswar":"⤩","setminus":"∖","setmn":"∖","sext":"✶","Sfr":"𝔖","sfr":"𝔰","sfrown":"⌢","sharp":"♯","SHCHcy":"Щ","shchcy":"щ","SHcy":"Ш","shcy":"ш","ShortDownArrow":"↓","ShortLeftArrow":"←","shortmid":"∣","shortparallel":"∥","ShortRightArrow":"→","ShortUpArrow":"↑","shy":"­","Sigma":"Σ","sigma":"σ","sigmaf":"ς","sigmav":"ς","sim":"∼","simdot":"⩪","sime":"≃","simeq":"≃","simg":"⪞","simgE":"⪠","siml":"⪝","simlE":"⪟","simne":"≆","simplus":"⨤","simrarr":"⥲","slarr":"←","SmallCircle":"∘","smallsetminus":"∖","smashp":"⨳","smeparsl":"⧤","smid":"∣","smile":"⌣","smt":"⪪","smte":"⪬","smtes":"⪬︀","SOFTcy":"Ь","softcy":"ь","solbar":"⌿","solb":"⧄","sol":"/","Sopf":"𝕊","sopf":"𝕤","spades":"♠","spadesuit":"♠","spar":"∥","sqcap":"⊓","sqcaps":"⊓︀","sqcup":"⊔","sqcups":"⊔︀","Sqrt":"√","sqsub":"⊏","sqsube":"⊑","sqsubset":"⊏","sqsubseteq":"⊑","sqsup":"⊐","sqsupe":"⊒","sqsupset":"⊐","sqsupseteq":"⊒","square":"□","Square":"□","SquareIntersection":"⊓","SquareSubset":"⊏","SquareSubsetEqual":"⊑","SquareSuperset":"⊐","SquareSupersetEqual":"⊒","SquareUnion":"⊔","squarf":"▪","squ":"□","squf":"▪","srarr":"→","Sscr":"𝒮","sscr":"𝓈","ssetmn":"∖","ssmile":"⌣","sstarf":"⋆","Star":"⋆","star":"☆","starf":"★","straightepsilon":"ϵ","straightphi":"ϕ","strns":"¯","sub":"⊂","Sub":"⋐","subdot":"⪽","subE":"⫅","sube":"⊆","subedot":"⫃","submult":"⫁","subnE":"⫋","subne":"⊊","subplus":"⪿","subrarr":"⥹","subset":"⊂","Subset":"⋐","subseteq":"⊆","subseteqq":"⫅","SubsetEqual":"⊆","subsetneq":"⊊","subsetneqq":"⫋","subsim":"⫇","subsub":"⫕","subsup":"⫓","succapprox":"⪸","succ":"≻","succcurlyeq":"≽","Succeeds":"≻","SucceedsEqual":"⪰","SucceedsSlantEqual":"≽","SucceedsTilde":"≿","succeq":"⪰","succnapprox":"⪺","succneqq":"⪶","succnsim":"⋩","succsim":"≿","SuchThat":"∋","sum":"∑","Sum":"∑","sung":"♪","sup1":"¹","sup2":"²","sup3":"³","sup":"⊃","Sup":"⋑","supdot":"⪾","supdsub":"⫘","supE":"⫆","supe":"⊇","supedot":"⫄","Superset":"⊃","SupersetEqual":"⊇","suphsol":"⟉","suphsub":"⫗","suplarr":"⥻","supmult":"⫂","supnE":"⫌","supne":"⊋","supplus":"⫀","supset":"⊃","Supset":"⋑","supseteq":"⊇","supseteqq":"⫆","supsetneq":"⊋","supsetneqq":"⫌","supsim":"⫈","supsub":"⫔","supsup":"⫖","swarhk":"⤦","swarr":"↙","swArr":"⇙","swarrow":"↙","swnwar":"⤪","szlig":"ß","Tab":"\\t","target":"⌖","Tau":"Τ","tau":"τ","tbrk":"⎴","Tcaron":"Ť","tcaron":"ť","Tcedil":"Ţ","tcedil":"ţ","Tcy":"Т","tcy":"т","tdot":"⃛","telrec":"⌕","Tfr":"𝔗","tfr":"𝔱","there4":"∴","therefore":"∴","Therefore":"∴","Theta":"Θ","theta":"θ","thetasym":"ϑ","thetav":"ϑ","thickapprox":"≈","thicksim":"∼","ThickSpace":"  ","ThinSpace":" ","thinsp":" ","thkap":"≈","thksim":"∼","THORN":"Þ","thorn":"þ","tilde":"˜","Tilde":"∼","TildeEqual":"≃","TildeFullEqual":"≅","TildeTilde":"≈","timesbar":"⨱","timesb":"⊠","times":"×","timesd":"⨰","tint":"∭","toea":"⤨","topbot":"⌶","topcir":"⫱","top":"⊤","Topf":"𝕋","topf":"𝕥","topfork":"⫚","tosa":"⤩","tprime":"‴","trade":"™","TRADE":"™","triangle":"▵","triangledown":"▿","triangleleft":"◃","trianglelefteq":"⊴","triangleq":"≜","triangleright":"▹","trianglerighteq":"⊵","tridot":"◬","trie":"≜","triminus":"⨺","TripleDot":"⃛","triplus":"⨹","trisb":"⧍","tritime":"⨻","trpezium":"⏢","Tscr":"𝒯","tscr":"𝓉","TScy":"Ц","tscy":"ц","TSHcy":"Ћ","tshcy":"ћ","Tstrok":"Ŧ","tstrok":"ŧ","twixt":"≬","twoheadleftarrow":"↞","twoheadrightarrow":"↠","Uacute":"Ú","uacute":"ú","uarr":"↑","Uarr":"↟","uArr":"⇑","Uarrocir":"⥉","Ubrcy":"Ў","ubrcy":"ў","Ubreve":"Ŭ","ubreve":"ŭ","Ucirc":"Û","ucirc":"û","Ucy":"У","ucy":"у","udarr":"⇅","Udblac":"Ű","udblac":"ű","udhar":"⥮","ufisht":"⥾","Ufr":"𝔘","ufr":"𝔲","Ugrave":"Ù","ugrave":"ù","uHar":"⥣","uharl":"↿","uharr":"↾","uhblk":"▀","ulcorn":"⌜","ulcorner":"⌜","ulcrop":"⌏","ultri":"◸","Umacr":"Ū","umacr":"ū","uml":"¨","UnderBar":"_","UnderBrace":"⏟","UnderBracket":"⎵","UnderParenthesis":"⏝","Union":"⋃","UnionPlus":"⊎","Uogon":"Ų","uogon":"ų","Uopf":"𝕌","uopf":"𝕦","UpArrowBar":"⤒","uparrow":"↑","UpArrow":"↑","Uparrow":"⇑","UpArrowDownArrow":"⇅","updownarrow":"↕","UpDownArrow":"↕","Updownarrow":"⇕","UpEquilibrium":"⥮","upharpoonleft":"↿","upharpoonright":"↾","uplus":"⊎","UpperLeftArrow":"↖","UpperRightArrow":"↗","upsi":"υ","Upsi":"ϒ","upsih":"ϒ","Upsilon":"Υ","upsilon":"υ","UpTeeArrow":"↥","UpTee":"⊥","upuparrows":"⇈","urcorn":"⌝","urcorner":"⌝","urcrop":"⌎","Uring":"Ů","uring":"ů","urtri":"◹","Uscr":"𝒰","uscr":"𝓊","utdot":"⋰","Utilde":"Ũ","utilde":"ũ","utri":"▵","utrif":"▴","uuarr":"⇈","Uuml":"Ü","uuml":"ü","uwangle":"⦧","vangrt":"⦜","varepsilon":"ϵ","varkappa":"ϰ","varnothing":"∅","varphi":"ϕ","varpi":"ϖ","varpropto":"∝","varr":"↕","vArr":"⇕","varrho":"ϱ","varsigma":"ς","varsubsetneq":"⊊︀","varsubsetneqq":"⫋︀","varsupsetneq":"⊋︀","varsupsetneqq":"⫌︀","vartheta":"ϑ","vartriangleleft":"⊲","vartriangleright":"⊳","vBar":"⫨","Vbar":"⫫","vBarv":"⫩","Vcy":"В","vcy":"в","vdash":"⊢","vDash":"⊨","Vdash":"⊩","VDash":"⊫","Vdashl":"⫦","veebar":"⊻","vee":"∨","Vee":"⋁","veeeq":"≚","vellip":"⋮","verbar":"|","Verbar":"‖","vert":"|","Vert":"‖","VerticalBar":"∣","VerticalLine":"|","VerticalSeparator":"❘","VerticalTilde":"≀","VeryThinSpace":" ","Vfr":"𝔙","vfr":"𝔳","vltri":"⊲","vnsub":"⊂⃒","vnsup":"⊃⃒","Vopf":"𝕍","vopf":"𝕧","vprop":"∝","vrtri":"⊳","Vscr":"𝒱","vscr":"𝓋","vsubnE":"⫋︀","vsubne":"⊊︀","vsupnE":"⫌︀","vsupne":"⊋︀","Vvdash":"⊪","vzigzag":"⦚","Wcirc":"Ŵ","wcirc":"ŵ","wedbar":"⩟","wedge":"∧","Wedge":"⋀","wedgeq":"≙","weierp":"℘","Wfr":"𝔚","wfr":"𝔴","Wopf":"𝕎","wopf":"𝕨","wp":"℘","wr":"≀","wreath":"≀","Wscr":"𝒲","wscr":"𝓌","xcap":"⋂","xcirc":"◯","xcup":"⋃","xdtri":"▽","Xfr":"𝔛","xfr":"𝔵","xharr":"⟷","xhArr":"⟺","Xi":"Ξ","xi":"ξ","xlarr":"⟵","xlArr":"⟸","xmap":"⟼","xnis":"⋻","xodot":"⨀","Xopf":"𝕏","xopf":"𝕩","xoplus":"⨁","xotime":"⨂","xrarr":"⟶","xrArr":"⟹","Xscr":"𝒳","xscr":"𝓍","xsqcup":"⨆","xuplus":"⨄","xutri":"△","xvee":"⋁","xwedge":"⋀","Yacute":"Ý","yacute":"ý","YAcy":"Я","yacy":"я","Ycirc":"Ŷ","ycirc":"ŷ","Ycy":"Ы","ycy":"ы","yen":"¥","Yfr":"𝔜","yfr":"𝔶","YIcy":"Ї","yicy":"ї","Yopf":"𝕐","yopf":"𝕪","Yscr":"𝒴","yscr":"𝓎","YUcy":"Ю","yucy":"ю","yuml":"ÿ","Yuml":"Ÿ","Zacute":"Ź","zacute":"ź","Zcaron":"Ž","zcaron":"ž","Zcy":"З","zcy":"з","Zdot":"Ż","zdot":"ż","zeetrf":"ℨ","ZeroWidthSpace":"​","Zeta":"Ζ","zeta":"ζ","zfr":"𝔷","Zfr":"ℨ","ZHcy":"Ж","zhcy":"ж","zigrarr":"⇝","zopf":"𝕫","Zopf":"ℤ","Zscr":"𝒵","zscr":"𝓏","zwj":"‍","zwnj":"‌"}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
// Require normalize.css.

// Require local CSS.

// Require jQuery.
const $ = __webpack_require__(9755);
// Setup global jQuery.
window.$ = $;
window.jQuery = $;
// Require Story.
const Story = __webpack_require__(3213);
// Create new Story instance.
window.Story = new Story();
// Create global store shortcut.
window.s = window.Story.store;
// Start story.
window.Story.start();

})();

/******/ })()
;