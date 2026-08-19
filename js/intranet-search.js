(function () {
  "use strict";

  const INDEX_URL = "search-index.json";
  const WDW_URL = "who-does-what.json";
  const MIN_CHARS = 2;

  let searchDataPromise = null;

  /*
   * Common alternate terms.
   * These help the actual search results,
   * not just autocomplete.
   */
  const aliases = {
    vacation: ["pto", "paid time off"],
    leave: ["pto", "paid time off"],

    benefits: ["insurance", "401k", "health"],
    insurance: ["benefits", "health"],
    retirement: ["401k", "benefits"],

    it: ["tech", "technology", "helpdesk", "support"],
    tech: ["it", "helpdesk", "technology"],
    computer: ["it", "tech", "helpdesk"],
    printer: ["print", "office services", "it"],

    expense: ["emburse", "accounts payable", "reimbursement"],
    reimbursement: ["emburse", "expense", "accounts payable"],
    ap: ["accounts payable", "emburse"],
    cc: ["credit card"],

    conference: ["conf room", "meeting room"],
    meeting: ["conference", "conf room"],

    phone: ["extension", "directory"],
    extensions: ["extension", "directory"],

    people: ["directory", "org chart", "who to call"],
    staff: ["directory", "org chart", "who to call"]
  };


  /* =========================================================
     BASIC HELPERS
     ========================================================= */

  function normalize(value) {
    return (value || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9@.\s&/-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }


  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  /* =========================================================
     SEARCH TOKEN EXPANSION
     ========================================================= */

  function getQueryTokens(query) {
    const base = normalize(query);

    const tokens = base
      .split(" ")
      .filter(Boolean);

    const expanded = new Set(tokens);


    tokens.forEach(token => {
      const relatedTerms = aliases[token] || [];

      relatedTerms.forEach(alias => {
        normalize(alias)
          .split(" ")
          .filter(Boolean)
          .forEach(part => expanded.add(part));
      });
    });


    return {
      base,
      tokens,
      expanded: Array.from(expanded)
    };
  }


  /* =========================================================
     RESULT SCORING
     ========================================================= */

  function scoreItem(item, query) {
    const q = getQueryTokens(query);

    if (!q.base) {
      return 0;
    }


    const title = normalize(item.title);
    const category = normalize(item.category);
    const description = normalize(item.description);

    const keywords = normalize(
      Array.isArray(item.keywords)
        ? item.keywords.join(" ")
        : item.keywords
    );

    const content = normalize(item.content);


    let score = 0;


    /*
     * Full phrase matches
     */

    if (title === q.base) {
      score += 160;

    } else if (title.startsWith(q.base)) {
      score += 100;

    } else if (title.includes(q.base)) {
      score += 70;
    }


    if (keywords.includes(q.base)) {
      score += 55;
    }


    if (description.includes(q.base)) {
      score += 30;
    }


    if (content.includes(q.base)) {
      score += 18;
    }


    if (category.includes(q.base)) {
      score += 18;
    }


    /*
     * Individual words
     */

    let matchedOriginal = 0;


    q.tokens.forEach(token => {
      let matched = false;


      if (title.includes(token)) {
        score += 26;
        matched = true;
      }


      if (keywords.includes(token)) {
        score += 16;
        matched = true;
      }


      if (description.includes(token)) {
        score += 9;
        matched = true;
      }


      if (content.includes(token)) {
        score += 5;
        matched = true;
      }


      if (category.includes(token)) {
        score += 5;
        matched = true;
      }


      if (matched) {
        matchedOriginal++;
      }
    });


    /*
     * Synonym matches
     */

    q.expanded
      .filter(token => !q.tokens.includes(token))
      .forEach(token => {

        if (title.includes(token)) {
          score += 8;
        }


        if (keywords.includes(token)) {
          score += 6;
        }


        if (description.includes(token)) {
          score += 3;
        }


        if (content.includes(token)) {
          score += 2;
        }
      });


    /*
     * Reward queries where every word matched.
     */

    if (
      q.tokens.length > 1 &&
      matchedOriginal === q.tokens.length
    ) {
      score += 35;
    }


    /*
     * Avoid garbage multi-word results.
     */

    if (
      q.tokens.length > 1 &&
      matchedOriginal === 0
    ) {
      score = 0;
    }


    /*
     * Slight preference for concise titles.
     */

    if (
      score > 0 &&
      title.length < 45
    ) {
      score += 3;
    }


    return score;
  }


  function search(items, query, limit) {
    const q = normalize(query);

    if (q.length < MIN_CHARS) {
      return [];
    }


    return items
      .map(item => ({
        item: item,
        score: scoreItem(item, query)
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => {
        return (
          b.score - a.score ||
          a.item.title.localeCompare(b.item.title)
        );
      })
      .slice(0, limit || 50)
      .map(result => result.item);
  }


  /* =========================================================
     JSON LOADING
     ========================================================= */

  async function fetchJson(url) {
    const separator = url.includes("?")
      ? "&"
      : "?";


    const response = await fetch(
      url + separator + "v=" + Date.now(),
      {
        cache: "no-store"
      }
    );


    if (!response.ok) {
      throw new Error(
        "Could not load " +
        url +
        " (" +
        response.status +
        ")"
      );
    }


    return response.json();
  }


  /* =========================================================
     WHO TO CALL / WHO DOES WHAT SEARCH DATA
     ========================================================= */

  function buildWhoDoesWhatResults(json) {
    if (
      !json ||
      !Array.isArray(json.items)
    ) {
      return [];
    }


    const people = json.people || {};


    return json.items.map((row, index) => {
      const contacts = (
        Array.isArray(row.personRefs)
          ? row.personRefs
          : []
      )
        .map(id => people[id])
        .filter(Boolean);


      const contactNames = contacts
        .map(person => person.name)
        .filter(Boolean);


      const contactDetails = contacts
        .flatMap(person => [
          person.email,
          person.ext,
          person.phone
        ])
        .filter(Boolean);


      const topic =
        row.topic || "Who to Call";


      return {
        id: "wdw-" + index,

        title: topic,

        category: "Who to Call",

        description: [
          row.dept,

          row.office &&
          row.office !== "ALL"
            ? row.office
            : "All offices",

          contactNames.join(", "),

          row.notes
        ]
          .filter(Boolean)
          .join(" • "),

        url:
          "Help.html?q=" +
          encodeURIComponent(topic),

        keywords: [
          row.office,
          row.dept,
          row.notes,
          ...contactNames,
          ...contactDetails
        ],

        content: [
          topic,
          row.office,
          row.dept,
          row.notes,
          ...contactNames,
          ...contactDetails
        ]
          .filter(Boolean)
          .join(" ")
      };
    });
  }


  /* =========================================================
     LOAD COMPLETE SEARCH DATABASE
     ========================================================= */

  async function loadSearchData() {
    if (!searchDataPromise) {
      searchDataPromise = Promise.allSettled([
        fetchJson(INDEX_URL),
        fetchJson(WDW_URL)
      ]).then(results => {

        let items = [];


        /*
         * search-index.json
         */

        if (results[0].status === "fulfilled") {
          const indexJson =
            results[0].value;


          if (Array.isArray(indexJson)) {
            items =
              items.concat(indexJson);

          } else if (
            indexJson &&
            Array.isArray(indexJson.items)
          ) {
            items =
              items.concat(indexJson.items);
          }

        } else {
          console.warn(
            "Intranet search index failed to load:",
            results[0].reason
          );
        }


        /*
         * who-does-what.json
         */

        if (results[1].status === "fulfilled") {
          items =
            items.concat(
              buildWhoDoesWhatResults(
                results[1].value
              )
            );

        } else {
          console.warn(
            "Who Does What data failed to load:",
            results[1].reason
          );
        }


        return items;
      });
    }


    return searchDataPromise;
  }


  /* =========================================================
     AUTOCOMPLETE WORD LIST
     ========================================================= */

  function buildAutocompleteTerms(items) {
    /*
     * Terms here are intentionally useful/common.
     *
     * Items and keywords from search-index.json
     * and who-does-what.json are also added
     * automatically below.
     */

    const priorityTerms = [
      "PTO",
      "helpdesk",
      "benefits",
      "billing",
      "directory",
      "Emburse",
      "FedEx",
      "WestLaw",
      "conference room",
      "office services",
      "extension list",
      "organizational chart",
      "health insurance",
      "IT Ticket",
      "Who to Call"
    ];


    const terms = new Set(priorityTerms);


    items.forEach(item => {

      /*
       * Add page/result titles.
       */

      if (
        item.title &&
        item.title.toString().trim().length >= 3
      ) {
        terms.add(
          item.title.toString().trim()
        );
      }


      /*
       * Add keywords.
       */

      if (Array.isArray(item.keywords)) {
        item.keywords.forEach(keyword => {

          if (
            keyword &&
            keyword.toString().trim().length >= 3
          ) {
            terms.add(
              keyword.toString().trim()
            );
          }

        });
      }

    });


    return Array.from(terms);
  }


  /* =========================================================
     FIND BEST AUTOCOMPLETE SUGGESTION
     ========================================================= */

  async function getAutocompleteSuggestion(typed) {
    const normalizedTyped =
      normalize(typed);


    if (
      normalizedTyped.length <
      MIN_CHARS
    ) {
      return "";
    }


    try {
      const items =
        await loadSearchData();


      const terms =
        buildAutocompleteTerms(items);


      const matchingTerms =
        terms.filter(term => {

          const normalizedTerm =
            normalize(term);


          return (
            normalizedTerm.startsWith(
              normalizedTyped
            ) &&
            normalizedTerm !==
              normalizedTyped
          );
        });


      if (!matchingTerms.length) {
        return "";
      }


      /*
       * Prefer:
       *
       * 1. Shorter completions
       * 2. Alphabetical if tied
       *
       * Examples:
       * PT   -> PTO
       * help -> helpdesk
       */

      matchingTerms.sort((a, b) => {
        const lengthDifference =
          normalize(a).length -
          normalize(b).length;


        if (lengthDifference !== 0) {
          return lengthDifference;
        }


        return a.localeCompare(b);
      });


      return matchingTerms[0];


    } catch (error) {
      console.warn(
        "Autocomplete failed:",
        error
      );

      return "";
    }
  }


  /* =========================================================
     UPDATE FAINT / GHOST AUTOCOMPLETE
     ========================================================= */

  async function updateGhostSuggestion(
    input,
    ghost
  ) {
    const typed =
      input.value;


    const normalizedTyped =
      normalize(typed);


    if (
      normalizedTyped.length <
      MIN_CHARS
    ) {
      ghost.innerHTML = "";

      input.dataset.suggestion = "";

      return;
    }


    const suggestion =
      await getAutocompleteSuggestion(
        typed
      );


    /*
     * Make sure the user hasn't typed
     * something else while the async
     * request was happening.
     */

    if (
      normalize(input.value) !==
      normalizedTyped
    ) {
      return;
    }


    if (!suggestion) {
      ghost.innerHTML = "";

      input.dataset.suggestion = "";

      return;
    }


    /*
     * Determine the remaining text.
     *
     * Example:
     *
     * typed      = "PT"
     * suggestion = "PTO"
     * remainder  = "O"
     */

    const remainder =
      suggestion.substring(
        typed.length
      );


    if (!remainder) {
      ghost.innerHTML = "";

      input.dataset.suggestion = "";

      return;
    }


    /*
     * The prefix takes up the same visual
     * space as what the user already typed,
     * but is transparent.
     *
     * Only the suggested remainder appears
     * faintly.
     */

    ghost.innerHTML =
      '<span class="intranet-search-ghost-prefix">' +
        escapeHtml(typed) +
      '</span>' +

      '<span class="intranet-search-ghost-remainder">' +
        escapeHtml(remainder) +
      '</span>';


    input.dataset.suggestion =
      suggestion;
  }


  /* =========================================================
     HEADER SEARCH
     ========================================================= */

  function setupHeaderSearch() {
    const nav =
      document.getElementById(
        "mainNav"
      );


    if (!nav) {
      return;
    }


    /*
     * Look for the search form.
     */

    let form =
      document.getElementById(
        "intranetSearchForm"
      );


    /*
     * Also recognizes the simple
     * manually-added version.
     */

    if (!form) {
      form =
        nav.querySelector(
          'form[action="search.html"]'
        );
    }


    if (!form) {
      return;
    }


    /*
     * Look for search input.
     */

    let input =
      document.getElementById(
        "intranetSearchInput"
      );


    if (!input) {
      input =
        form.querySelector(
          'input[name="q"]'
        );
    }


    if (!input) {
      return;
    }


    /*
     * Normalize IDs/classes so every
     * page works the same way.
     */

    form.id =
      "intranetSearchForm";


    form.classList.add(
      "intranet-search-form"
    );


    input.id =
      "intranetSearchInput";


    input.classList.add(
      "intranet-search-input"
    );


    input.setAttribute(
      "autocomplete",
      "off"
    );


    input.setAttribute(
      "spellcheck",
      "false"
    );


    const searchLi =
      form.closest("li");


    if (searchLi) {
      searchLi.classList.add(
        "intranet-search-nav"
      );
    }


    /*
     * REMOVE OLD BLUE RESULTS DROPDOWN.
     *
     * This is the piece that caused the
     * strange layout in your screenshot.
     */

    const oldDropdown =
      document.getElementById(
        "intranetSearchDropdown"
      );


    if (oldDropdown) {
      oldDropdown.remove();
    }


    /*
     * CREATE INLINE GHOST SUGGESTION
     */

    let ghost =
      document.getElementById(
        "intranetSearchGhost"
      );


    if (!ghost) {
      ghost =
        document.createElement("div");


      ghost.id =
        "intranetSearchGhost";


      ghost.className =
        "intranet-search-ghost";


      ghost.setAttribute(
        "aria-hidden",
        "true"
      );


      /*
       * Put it directly before the
       * actual input.
       */

      input.parentNode.insertBefore(
        ghost,
        input
       );
    }


    /*
     * If search.html?q=Something is open,
     * put that query into the header box.
     */

    const urlQuery =
      new URLSearchParams(
        window.location.search
      ).get("q");


    if (
      /search\.html$/i.test(
        window.location.pathname
      ) &&
      urlQuery
    ) {
      input.value =
        urlQuery;
    }


    /*
     * USER TYPES
     */

    input.addEventListener(
      "input",
      function () {
        updateGhostSuggestion(
          input,
          ghost
        );
      }
    );


    /*
     * USER CLICKS INTO SEARCH FIELD
     */

    input.addEventListener(
      "focus",
      function () {
        updateGhostSuggestion(
          input,
          ghost
        );
      }
    );


    /*
     * KEYBOARD CONTROLS
     *
     * Tab:
     * Accept suggestion
     *
     * Right Arrow:
     * Accept suggestion only if cursor
     * is already at end of typed text.
     *
     * Escape:
     * Dismiss suggestion
     */

    input.addEventListener(
      "keydown",
      function (event) {

        const suggestion =
          input.dataset.suggestion || "";


        const caretAtEnd =
          input.selectionStart ===
          input.value.length &&
          input.selectionEnd ===
          input.value.length;


        const acceptsSuggestion =
          suggestion &&
          caretAtEnd &&
          (
            event.key === "Tab" ||
            event.key === "ArrowRight"
          );


        if (acceptsSuggestion) {
          event.preventDefault();


          input.value =
            suggestion;


          input.dataset.suggestion =
            "";


          ghost.innerHTML =
            "";


          /*
           * Put cursor at end.
           */

          input.setSelectionRange(
            input.value.length,
            input.value.length
          );


          return;
        }


        if (event.key === "Escape") {
          ghost.innerHTML = "";

          input.dataset.suggestion =
            "";
        }

      }
    );


    /*
     * SUBMIT SEARCH
     */

    form.addEventListener(
      "submit",
      function (event) {
        event.preventDefault();


        const query =
          input.value.trim();


        if (!query) {
          return;
        }


        window.location.href =
          "search.html?q=" +
          encodeURIComponent(query);
      }
    );


    /*
     * Initial state.
     */

    if (input.value.trim()) {
      updateGhostSuggestion(
        input,
        ghost
      );
    }
  }


  /* =========================================================
     FULL SEARCH.HTML PAGE
     ========================================================= */

  async function initSearchPage() {
    const pageInput =
      document.getElementById(
        "searchPageInput"
      );


    const resultsElement =
      document.getElementById(
        "searchPageResults"
      );


    const summaryElement =
      document.getElementById(
        "searchPageSummary"
      );


    /*
     * If these don't exist, we're not
     * currently on search.html.
     */

    if (
      !pageInput ||
      !resultsElement ||
      !summaryElement
    ) {
      return;
    }


    const headerInput =
      document.getElementById(
        "intranetSearchInput"
      );


    const query =
      new URLSearchParams(
        window.location.search
      ).get("q") || "";


    pageInput.value =
      query;


    if (headerInput) {
      headerInput.value =
        query;
    }


    let debounce = null;


    /*
     * Render full page results.
     */

    async function renderPage(value) {
      const trimmed =
        value.trim();


      if (
        trimmed.length <
        MIN_CHARS
      ) {
        summaryElement.textContent =
          "Type at least 2 characters to search the intranet.";


        resultsElement.innerHTML =
          "";


        return;
      }


      summaryElement.textContent =
        "Searching...";


      try {
        const items =
          await loadSearchData();


        const results =
          search(
            items,
            trimmed,
            100
          );


        summaryElement.textContent =
          results.length +
          " result" +
          (
            results.length === 1
              ? ""
              : "s"
          ) +
          ' for "' +
          trimmed +
          '"';


        /*
         * No results.
         */

        if (!results.length) {
          resultsElement.innerHTML =
            `
            <div class="alert alert-light border mb-0">
              <strong>No matches.</strong>
              Try a broader term such as
              PTO, IT, billing, directory,
              FedEx, or a person's name.
            </div>
            `;


          return;
        }


        /*
         * Render results.
         */

        resultsElement.innerHTML =
          results
            .map(item => `
              <a
                class="search-page-result"
                href="${escapeHtml(item.url)}"
              >

                <div class="category">
                  ${escapeHtml(
                    item.category ||
                    "Intranet"
                  )}
                </div>

                <h3>
                  ${escapeHtml(
                    item.title
                  )}
                </h3>

                ${
                  item.description
                    ? `
                      <p>
                        ${escapeHtml(
                          item.description
                        )}
                      </p>
                    `
                    : ""
                }

              </a>
            `)
            .join("");


      } catch (error) {
        console.error(error);


        summaryElement.textContent =
          "Search could not load.";


        resultsElement.innerHTML =
          `
          <div class="alert alert-danger mb-0">

            The search index could not be loaded.

            Check that
            <strong>search-index.json</strong>
            and
            <strong>who-does-what.json</strong>
            are in the root folder.

          </div>
          `;
      }
    }


    /*
     * LIVE SEARCHING ON SEARCH.HTML
     */

    pageInput.addEventListener(
      "input",
      function () {
        const value =
          pageInput.value;


        /*
         * Keep header field synced.
         */

        if (headerInput) {
          headerInput.value =
            value;
        }


        clearTimeout(debounce);


        debounce =
          setTimeout(
            function () {

              /*
               * Update URL without
               * refreshing the page.
               */

              const url =
                new URL(
                  window.location.href
                );


              if (value.trim()) {
                url.searchParams.set(
                  "q",
                  value.trim()
                );

              } else {
                url.searchParams.delete(
                  "q"
                );
              }


              history.replaceState(
                null,
                "",
                url
              );


              renderPage(
                value
              );

            },
            120
          );
      }
    );


    /*
     * Initial render.
     */

    renderPage(
      query
    );
  }


  /* =========================================================
     START EVERYTHING
     ========================================================= */

  document.addEventListener(
    "DOMContentLoaded",
    function () {
      setupHeaderSearch();

      initSearchPage();
    }
  );

})();