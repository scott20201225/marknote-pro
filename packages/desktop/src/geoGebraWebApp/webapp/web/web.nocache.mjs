/*
 * Copyright 2010 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */
window.web = function() {
  var $wnd = window;
  var $doc = document;

  /****************************************************************************
   * Internal Helper Functions
   ***************************************************************************/

  function isHostedMode() {
    var query = $wnd.location.search;
    return ((query.indexOf('gwt.codesvr.web=') != -1) ||
            (query.indexOf('gwt.codesvr=') != -1));
  }

  // Helper function to send statistics to the __gwtStatsEvent function if it
  // exists.
  function sendStats(evtGroupString, typeString) {
    if ($wnd.__gwtStatsEvent) {
      $wnd.__gwtStatsEvent({
        moduleName: 'web',
        sessionId: $wnd.__gwtStatsSessionId,
        subSystem: 'startup',
        evtGroup: evtGroupString,
        millis:(new Date()).getTime(),
        type: typeString,
      });
    }
  }


  /****************************************************************************
   * Exposed Functions and Variables
   ***************************************************************************/
  // These are set by various parts of the bootstrapping code, but they always
  // need to exist, so give them all default values here.

  // Exposed for the convenience of the devmode.js and md5.js files
  window.web.__sendStats = sendStats;

  // Exposed for the call made to gwtOnLoad. Some are not figured out yet, so
  // assign them later, once the values are known.
  window.web.__moduleName = 'web';
  window.web.__errFn = null;
  window.web.__moduleBase = 'DUMMY';
  window.web.__softPermutationId = 0;

  // Exposed for devmode.js
  window.web.__computePropValue = null;
  // Exposed for super dev mode
  window.web.__getPropMap = null;

  // Exposed for runAsync
  window.web.__installRunAsyncCode = function() {};
  window.web.__gwtStartLoadingFragment = function() { return null; };

  // Exposed for property provider code
  window.web.__gwt_isKnownPropertyValue = function() { return false; };
  window.web.__gwt_getMetaProperty = function() { return null; };

  // Exposed for permutations code
  var __propertyErrorFunction = null;


  // Set up our entry in the page-wide registry of active modules.
  // It must be set up before calling computeScriptBase() and
  // getCompiledCodeFilename().
  var activeModules =
      ($wnd.__gwt_activeModules = ($wnd.__gwt_activeModules || {}));
  activeModules["web"] = {moduleName: "web"};

  window.web.__moduleStartupDone = function(permProps) {
    // Make embedded properties available to Super Dev Mode.
    // (They override any properties already exported.)
    var oldBindings = activeModules["web"].bindings;
    activeModules["web"].bindings = function() {
      var props = oldBindings ? oldBindings() : {};
      var embeddedProps = permProps[window.web.__softPermutationId];
      for (var i = 0; i < embeddedProps.length; i++) {
        var pair = embeddedProps[i];
        props[pair[0]] = pair[1];
      }
      return props;
    };
  };

  /****************************************************************************
   * Internal Helper functions that have been broken out into their own .js
   * files for readability and for easy sharing between linkers.  The linker
   * code will inject these functions in these placeholders.
   ***************************************************************************/
  // Provides getInstallLocationDoc() function.
  // GWT code can be installed anywhere, but an iFrame is the best place if you
// want both variable isolation and runAsync support. Variable isolation is
// useful for avoiding conflicts with JavaScript libraries and critical if
// you want more than one GWT module on your page. The runAsync implementation
// will need to install additional chunks of code into the same iFrame later.
//
// By default, CrossSiteIFrameLinker will use this script to create the iFrame.
// It may be replaced by overriding CrossSiteIframeLinker.getJsInstallLocation()
// to return the name of a different resource file. The replacement script may
// optionally set this variable inside the iframe:
//
// $wnd - the location where the bootstrap module is defined. It should also
//        be the location where the __gwtStatsEvent function is defined.
//        If not set, the module will set $wnd to window.parent.

var frameDoc;

function getInstallLocationDoc() {
  setupInstallLocation();
  return frameDoc;
}

// This function is left for compatibility
// and may be used by custom linkers
function getInstallLocation() {
  return getInstallLocationDoc().body;
}

function setupInstallLocation() {
  if (frameDoc) { return; }
  // Create the script frame, making sure it's invisible, but not
  // "display:none", which keeps some browsers from running code in it.
  var scriptFrame = $doc.createElement('iframe');
  scriptFrame.id = 'web';
  scriptFrame.style.cssText = 'position:absolute; width:0; height:0; border:none; left: -1000px;'
    + ' top: -1000px;';
  scriptFrame.tabIndex = -1;
  $doc.body.appendChild(scriptFrame);

  frameDoc = scriptFrame.contentWindow.document;

  // The following code is needed for proper operation in Firefox, Safari, and
  // Internet Explorer.
  //
  // In Firefox, this prevents the frame from re-loading asynchronously and
  // throwing away the current document.
  //
  // In IE, it ensures that the <body> element is immediately available.
  if (navigator.userAgent.indexOf("Chrome") == -1) {
    frameDoc.open();
    var doctype = (document.compatMode == 'CSS1Compat') ? '<!doctype html>' : '';
    frameDoc.write(doctype + '<html><head></head><body></body></html>');
    frameDoc.close();
  }
}


  // Installs the script directly, by simply appending a script tag with the
  // src set to the correct location to the install location.
  function installScript(filename) {
    // Provides the setupWaitForBodyLoad()function
    // Setup code which waits for the body to be loaded and then calls the
// callback function
function setupWaitForBodyLoad(callback) {
  // Provides the isBodyLoaded() function
  function isBodyLoaded() {
  if (typeof $doc.readyState == "undefined") {
    // FF 3.5 and below does not have readyState, but it does allow us to
    // append to the body before it has finished loading, so we return whether
    // the body element exists. Note that for very few apps, this may cause
    // problems because they do something in onModuleLoad that assumes the body
    // is loaded.  For those apps, we provide an alternative implementation
    // in isBodyLoadedFf35Fix.js
    return (typeof $doc.body != "undefined" && $doc.body != null);
  }
  return (/loaded|complete/.test($doc.readyState));
}

  
  var bodyDone = isBodyLoaded();

  if (bodyDone) {
    callback();
    return;
  }

  // If the page is not already loaded, setup some listeners and timers to
  // detect when it is done.
  function checkBodyDone() {
    if (!bodyDone) {
      if (!isBodyLoaded()) {
        return;
      }

      bodyDone = true;
      callback();

      if ($doc.removeEventListener) {
        $doc.removeEventListener("readystatechange", checkBodyDone, false);
      }
      if (onBodyDoneTimerId) {
        clearInterval(onBodyDoneTimerId);
      }
    }
  }

  // For everyone that supports readystatechange.
  if ($doc.addEventListener) {
    $doc.addEventListener("readystatechange", checkBodyDone, false);
  }

  // Fallback. If onBodyDone() gets fired twice, it's not a big deal.
  var onBodyDoneTimerId = setInterval(function() {
    checkBodyDone();
  }, 10);
}


    function installCode(code) {
      var doc = getInstallLocationDoc();
      var docbody = doc.body;
      var script = doc.createElement('script');
      script.language='javascript';
      script.crossOrigin='';
      script.src = code;
      if (window.web.__errFn) {
        script.onerror = function() {
          window.web.__errFn('web', new Error("Failed to load " + code));
        }
      }
      docbody.appendChild(script);
    }

    // Just pass along the filename so that a script tag can be installed in the
    // iframe to download it.  Since we will be adding the iframe to the body,
    // we still need to wait for the body to load before going forward.
    setupWaitForBodyLoad(function() {
      installCode(filename);
    });
  }


  // Sets the *.__installRunAsyncCode and
  // *.__startLoadingFragment functions
  window.web.__startLoadingFragment = function(fragmentFile) {
    return computeUrlForResource(fragmentFile);
  };

  window.web.__installRunAsyncCode = function(code) {
    var doc = getInstallLocationDoc();
    var docbody = doc.body;
    var script = doc.createElement('script');
    script.text = code;
    docbody.appendChild(script);

    // Unless we're in pretty mode, remove the tags to shrink the DOM a little.
    // It should have installed its code immediately after being added.
    docbody.removeChild(script);
  }

  // Provides the computeScriptBase() function
  function computeScriptBase() {
   function getDirectoryOfFile(path) {
      // Truncate starting at the first '?' or '#', whichever comes first.
      var hashIndex = path.lastIndexOf('#');
      if (hashIndex == -1) {
        hashIndex = path.length;
      }
      var queryIndex = path.indexOf('?');
      if (queryIndex == -1) {
        queryIndex = path.length;
      }
      var slashIndex = path.lastIndexOf('/', Math.min(queryIndex, hashIndex));
      return (slashIndex >= 0) ? path.substring(0, slashIndex + 1) : '';
    }
    return getDirectoryOfFile(import.meta.url);
  }

  // Provides the computeUrlForResource() function
  function computeUrlForResource(resource) {
    /* return an absolute path unmodified */
    if (resource.match(/^\//)) {
      return resource;
    }
    /* return a fully qualified URL unmodified */
    if (resource.match(/^[a-zA-Z]+:\/\//)) {
      return resource;
    }
    return window.web.__moduleBase + resource;
  }

  // Provides the getCompiledCodeFilename() function
  function getCompiledCodeFilename() {
    // Default to 0, as the strongName for permutation 0 does not include a ":0" suffix
    // for backwards compatibility purposes (@see PermutationsUtil::addPermutationsJs).
    var softPermutationId = 0;
    var strongName;

    try {
      // __PERMUTATIONS_BEGIN__
      // Permutation logic is injected here. this code populates the
      // answers variable.
      strongName = '9B2B79D24637CB9FA30D2CB30E68F172';// __PERMUTATIONS_END__
      var idx = strongName.indexOf(':');
      if (idx != -1) {
        softPermutationId = parseInt(strongName.substring(idx + 1), 10);
        strongName = strongName.substring(0, idx);
      }
    } catch (e) {
      // intentionally silent on property failure
    }
    window.web.__softPermutationId = softPermutationId;
    return computeUrlForResource(strongName + '.cache.js');
  }

  /****************************************************************************
   * Bootstrap startup code
   ***************************************************************************/

  // Must be set before getCompiledFilename() is called
  window.web.__moduleBase = computeScriptBase();
  activeModules["web"].moduleBase = window.web.__moduleBase;

  // Must be done right before the "bootstrap" "end" stat is sent
  var filename = getCompiledCodeFilename();

  installScript(filename);

  return true; // success
}

window.web.submodules = {};
window.web.onReady = function(submodule, userRender) {
  function beforeRender(options, onload) {
     return new Promise(resolve => {
       resolve(options)
     });
  }

  const render = (options, onload) => {
    beforeRender(options, onload).then(opts => userRender(opts, onload))
  }

  for (let callback of window.web.submodules[submodule].callbacks) {
    callback(render);
  }
  window.web.submodules[submodule].render = render;
}

window.web.succeeded = window.web();

function Widget(options, submodule, baseTag)  {
  const self = this;
  self.loading = false;
  this.apiCallbacks = [api => self.api = api];

  function runCallbacks(api) {
    for (const callback of self.apiCallbacks) {
      callback(api);
    }
    if (options.removePreview) {
      options.removePreview();
    }
  }

  function load() {
    self.loading = true;
    if (submodule.render) {
      submodule.render(options, runCallbacks);
    } else {
      submodule.callbacks.push(render => render(options, runCallbacks));
    }
  }

  this.inject = function(element) {
    const target = document.createElement(baseTag);
    options.element = target;
    element.appendChild(target);
    load();
    return this;
  }

  this.getAPI = function() {
    return new Promise(resolve => {
      if (self.api) {
        resolve(self.api);
      } else if (self.loading) {
        self.apiCallbacks.push(resolve);
      } else {
        load(resolve);
      }
    });
  }

  if (options.tagName || options.element) {
    load();
  }
}

const createSubmoduleAPI = (submodule, baseTag) => {
  window.web.submodules[submodule] = {callbacks:[]};
  return {
    create: (options) => {
      return new Widget(options || {}, window.web.submodules[submodule], baseTag);
    }
  }
};
// add export statements
export const mathApps = createSubmoduleAPI("mathApps", "div");
