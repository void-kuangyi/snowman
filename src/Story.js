/**
 * @external Element
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Element}
 */
const $ = require('jquery');
const ejs = require('ejs');
const Passage = require('./Passage.js');
const Markdown = require('./Markdown.js');
const State = require('./State.js');

/**
 * An object representing the entire story. After the document has completed
 * loading, an instance of this class will be available at `window.story`.
 *
 * @class Story
 */
class Story {
  constructor () {
    /**
     * @property {Element} storyDataElement - Reference to tw-storydata element
     * @type {Element}
     * @readonly
     */
    this.storyDataElement = $('tw-storydata');

    /**
     * @property {string} name - The name of the story.
     * @type {string}
     * @readonly
     */
    this.name = this.storyDataElement.attr('name');

    /**
     * @property {number} startPassage - The ID of the first passage to be displayed.
     * @type {number}
     * @readonly
     */
    this.startPassage = parseInt(this.storyDataElement.attr('startnode'));

    /**
     * @property {string} creator - The program that created this story.
     * @type {string}
     * @readonly
     */
    this.creator = this.storyDataElement.attr('creator');

    /**
     * @property {string} creatorVersion - The version of the program used to create this story.
     * @type {string}
     * @readonly
     */
    this.creatorVersion = this.storyDataElement.attr('creator-version');

    // Create internal events and storehouse for state.
    State.createStore();

    /**
     * @property {string} state - State proxy; an object with mutation tracking
     * @type {object}
     */
    this.state = State.proxy;

    /**
     * An array of all passages, indexed by ID.
     *
     * @property {Array} passages - Passages array
     * @type {Array}
     */
    this.passages = [];

    // For each child element of the tw-storydata element,
    //  create a new Passage object based on its attributes.
    this.storyDataElement.children('tw-passagedata').each((index, element) => {
      const elementReference = $(element);
      const id = parseInt(elementReference.attr('pid'));
      let tags = elementReference.attr('tags');

      // Does the 'tags' attribute exist?
      if (tags !== '' && tags !== undefined) {
        // Attempt to split by space
        tags = tags.split(' ');
      } else {
        // It did not exist, so we create it as an empty array.
        tags = [];
      }

      this.passages.push(new Passage(
        id,
        elementReference.attr('name'),
        tags,
        elementReference.html()
      ));
    });

    /**
     * An array of user-specific scripts to run when the story is begun.
     *
     * @property {Array} userScripts - Array of user-added JavaScript
     * @type {Array}
     */
    this.userScripts = [];

    // Add the internal (HTML) contents of all SCRIPT tags
    $('*[type="text/twine-javascript"]').each((index, value) => {
      this.userScripts.push($(value).html());
    });

    /**
     * An array of user-specific style declarations to add when the story is
     * begun.
     *
     * @property {Array} userStyles - Array of user-added styles
     * @type {Array}
     */
    this.userStyles = [];

    // Add the internal (HTML) contents of all STYLE tags
    $('*[type="text/twine-css"]').each((index, value) => {
      this.userStyles.push($(value).html());
    });

    /**
     * Story element
     *
     * @property {Element} storyElement - Story element
     * @type {Element}
     * @readonly
     */
    this.storyElement = $('tw-story');

    // Listen for all navigation events.
    // These happen when a user clicks on a link.
    State.events.on('navigation', dest => {
      // Add to the state's history.
      State.history.push(dest);
      // Check if undo icon should be shown or not.
      if (State.history.length >= 1) {
        this.undoIcon.show();
      }
    });

    // Catch user clicking on links and create navigation event
    this.storyElement.on('click', 'tw-link[data-passage]', (e) => {
      // Pull destination passage name from the attribute.
      const passageName = Markdown.unescape($(e.target).closest('[data-passage]').data('passage'));
      /**
       * Triggered when user initiates passage navigation.
       *
       * @event navigation
       */
      State.events.emit('navigation', passageName);
      // Show the passage by name.
      this.show(passageName);
    });

    /**
     * Passage element
     *
     * @property {Element} passageElement - Passage element
     * @type {Element}
     */
    this.passageElement = $('tw-passage');

    /**
     * Reference to undo icon
     *
     * @property {Element} undoIcon - Undo element
     * @type {Element}
     */
    this.undoIcon = $('tw-icon[title="Undo"]');

    // Start the story with it hidden.
    this.undoIcon.hide();

    // Listen for user click interactions
    this.undoIcon.on('click', () => {
      /**
       * Triggered when user clicks on the undo button.
       *
       * @event undo
       */
      State.events.emit('undo');
    });

    // Listen for undo events
    State.events.on('undo', () => {
      State.history.pop();
      if (State.history.length === 0) {
        // Hide the undo button.
        this.undoIcon.hide();
        // Show the starting passage again.
        this.show(this.getPassageById(this.startPassage).name);
      }
    });
  }

  /**
   * Begins playing this story based on data from tw-storydata.
   * 1. Apply all user styles
   * 2. Try to run all user scripts
   * 3. Trigger story started event
   * 4. Tries to find startPassage's id in this.passages array
   * 4. Throws error if startPassage's id does not exist
   * 5. Calls show() using startPassage's name
   *
   * @function start
   */

  start () {
    // Are there any user styles to parse?
    if (this.userStyles.length > 0) {
      // For each, add them to the body as extra style elements
      this.userStyles.forEach((style) => {
        $(document.body).append(`<style>${style}</style>`);
      });
    }

    // Are there any user scripts to parse?
    if (this.userScripts.length > 0) {
      // For each, render them as JavaScript inside EJS
      this.userScripts.forEach((script) => {
        try {
          ejs.render(`<%${script}%>`, { s: window.story.state, $ });
        } catch (error) {
          throw new Error(`User script error: ${error}`);
        }
      });
    }

    // Retrieve Passage object matching starting passage id.
    const passage = this.getPassageById(this.startPassage);

    // Does the passage exist?
    if (passage === null) {
      // It does not exist.
      // Throw an error.
      throw new Error('Starting passage pid does not exist!');
    }

    // Show the passage by name
    this.show(passage.name);
  }

  /**
   * Returns an array of none, one, or many passages matching a specific tag.
   *
   * @function getPassagesByTags
   * @param {string} tag - Tag to search for
   * @returns {Array} Array containing none, one, or many passage objects
   */
  getPassagesByTags (tag) {
    // Search internal passages
    return this.passages.filter((p) => {
      return p.tags.includes(tag);
    });
  }

  /**
   * Returns a Passage object by id from internal collection. If none exists, returns null.
   * The Twine editor prevents multiple passages from having the same id, so
   *  this always returns the first search result.
   *
   * @function getPassageById
   * @param {number} id - id of the passage
   * @returns {Passage|null} Passage object or null
   */
  getPassageById (id) {
    // Create default value
    let passage = null;

    // Search for any passages with the name
    const result = this.passages.filter((p) => p.id === id);

    // Were any found?
    if (result.length !== 0) {
      // Grab the first result.
      passage = result[0];
    }

    // Return either null or first result found.
    return passage;
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
   * @param {string} name - name of the passage
   */
  show (name) {
    const passage = this.getPassageByName(name);

    if (passage === null) {
      throw new Error(`There is no passage with the name ${name}`);
    }

    // Set the global passage to the one about to be shown.
    window.passage = passage;

    // Overwrite the parsed with the rendered.
    this.passageElement.html(passage.render());
  }

  /**
   * Returns the HTML source for a passage. This is most often used when
   * embedding one passage inside another. In this instance, make sure to
   * use <%= %> instead of <%- %> to avoid incorrectly encoding HTML entities.
   *
   * @function render
   * @param {string} name - name of the passage
   * @returns {string} HTML source code
   */
  render (name) {
    // Search for passage by name
    const passage = this.getPassageByName(name);

    // Does this passage exist?
    if (passage === null) {
      // It does not exist.
      // Throw error.
      throw new Error('There is no passage with name ' + name);
    }

    // Return the rendered passage source.
    return passage.render();
  }

  /**
   * Render a passage to any/all element(s) matching query selector
   *
   * @function renderToSelector
   * @param {object} passageName - The passage to render
   * @param {string} selector - jQuery selector
   */
  renderToSelector (passageName, selector) {
    // Search for passage by name
    const passage = this.getPassageByName(passageName);

    // Does this passage exist?
    if (passage === null) {
      // It does not exist.
      // Throw error.
      throw new Error('There is no passage with name ' + passageName);
    }

    // Render content to a specific selector.
    $(selector).html(passage.render());
  }

  /**
   * Applies external CSS files
   *
   * @function applyExternalStyles
   * @param {Array} files - Array of one or more external files to load
   */
  applyExternalStyles (files) {
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
}

module.exports = Story;
