(function () {
  "use strict";

  var repository = "sottyon/nalaspackwalks";
  var branch = "main";
  var contentPath = "site-content.json";
  var contentUrl = "https://api.github.com/repos/" + repository + "/contents/" + contentPath;
  var priceLabels = {
    walk30: "Dog walk (30 minutes)",
    walk60: "Dog walk (60 minutes)",
    dropin: "Dog sitting visit (30 minutes)",
    house: "House sitting (per night)",
    additionalDogWalkVisit: "Each additional dog (walk or visit)",
    additionalDogHouse: "Each additional dog (per night)",
    rushFee: "Squeeze-in fee (within 24 hours)"
  };
  var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var tokenKey = "nalaspackwalks-editor-token";
  var state = { token: "", sha: "", data: null, month: new Date(new Date().getFullYear(), new Date().getMonth(), 1) };
  var $ = function (id) { return document.getElementById(id); };

  if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    document.body.textContent = "The site editor is available only on this computer.";
    return;
  }

  function showMessage(text, kind) {
    var message = $("message");
    message.textContent = text;
    message.className = "notice" + (kind ? " " + kind : "");
    message.hidden = false;
  }

  function checkedData(data) {
    if (!data || !data.prices || !Array.isArray(data.reviews) || !data.availability ||
      typeof data.availability !== "object") {
      throw new Error("The site content file has an invalid format. No changes were made.");
    }
    Object.keys(priceLabels).forEach(function (key) {
      if (typeof data.prices[key] !== "number" || !Number.isFinite(data.prices[key]) || data.prices[key] < 0) {
        throw new Error("The site content file has an invalid price for " + priceLabels[key] + ".");
      }
    });
    data.reviews.forEach(function (review) {
      if (!review || typeof review.quote !== "string" || typeof review.author !== "string" ||
        !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
        throw new Error("A review is incomplete or has an invalid rating. No changes were made.");
      }
    });
    Object.keys(data.availability).forEach(function (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !["available", "unavailable"].includes(data.availability[date])) {
        throw new Error("The calendar contains an invalid date or status. No changes were made.");
      }
    });
    return data;
  }

  function decodeContent(encoded) {
    var binary = atob(encoded.replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function encodeContent(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function apiError(response, body) {
    if (response.status === 401 || response.status === 403) {
      return "GitHub rejected this token. Check its expiration, repository access, and Contents read/write permission.";
    }
    if (response.status === 404) return "GitHub could not find the repository or content file for the configured branch.";
    if (response.status === 409 || response.status === 422) {
      return "GitHub could not save because the content changed or the branch is protected. Reload the editor and try again.";
    }
    return body && body.message ? "GitHub error: " + body.message : "GitHub request failed (" + response.status + ").";
  }

  function githubRequest(url, options) {
    options = options || {};
    options.headers = Object.assign({
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + state.token,
      "X-GitHub-Api-Version": "2022-11-28"
    }, options.headers || {});
    return fetch(url, options).then(function (response) {
      return response.text().then(function (text) {
        var body = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(apiError(response, body));
        return body;
      });
    });
  }

  function loadContent() {
    return githubRequest(contentUrl + "?ref=" + encodeURIComponent(branch)).then(function (file) {
      if (!file.content) throw new Error("GitHub returned an empty site content file.");
      state.sha = file.sha;
      state.data = checkedData(JSON.parse(decodeContent(file.content)));
      renderEditor();
      $("connect-panel").hidden = true;
      $("editor").hidden = false;
      $("connection-status").textContent = "Connected to " + repository + " (" + branch + ").";
    });
  }

  function renderPrices() {
    var container = $("prices");
    container.replaceChildren();
    Object.keys(priceLabels).forEach(function (key) {
      var wrapper = document.createElement("div");
      wrapper.className = "price-field";
      var label = document.createElement("label");
      var input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "0.01";
      input.value = state.data.prices[key];
      input.dataset.price = key;
      input.id = "price-" + key;
      label.htmlFor = input.id;
      label.textContent = priceLabels[key];
      wrapper.append(label, input);
      container.append(wrapper);
    });
  }

  function renderReviews() {
    var container = $("reviews");
    container.replaceChildren();
    if (!state.data.reviews.length) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No reviews added yet.";
      container.append(empty);
    }
    state.data.reviews.forEach(function (review, index) {
      var card = document.createElement("article");
      card.className = "review-card";
      var quoteLabel = document.createElement("label");
      quoteLabel.className = "field";
      quoteLabel.textContent = "Review";
      var quote = document.createElement("textarea");
      quote.required = true;
      quote.value = review.quote;
      quote.addEventListener("input", function () { review.quote = quote.value; });
      quoteLabel.append(quote);
      var authorLabel = document.createElement("label");
      authorLabel.className = "field";
      authorLabel.textContent = "Name and neighborhood";
      var author = document.createElement("input");
      author.type = "text";
      author.required = true;
      author.value = review.author;
      author.addEventListener("input", function () { review.author = author.value; });
      authorLabel.append(author);
      var ratingLabel = document.createElement("label");
      ratingLabel.className = "field";
      ratingLabel.textContent = "Star rating";
      var rating = document.createElement("select");
      for (var stars = 1; stars <= 5; stars++) {
        var option = document.createElement("option");
        option.value = String(stars);
        option.textContent = stars + (stars === 1 ? " star" : " stars");
        rating.append(option);
      }
      rating.value = String(review.rating);
      rating.addEventListener("change", function () { review.rating = Number(rating.value); });
      ratingLabel.append(rating);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn danger";
      remove.textContent = "Remove review";
      remove.addEventListener("click", function () {
        state.data.reviews.splice(index, 1);
        renderReviews();
      });
      card.append(quoteLabel, authorLabel, ratingLabel, remove);
      container.append(card);
    });
  }

  function dateKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" +
      String(date.getDate()).padStart(2, "0");
  }

  function renderCalendar() {
    var grid = $("calendar");
    grid.replaceChildren();
    $("calendar-month").textContent = state.month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    weekdays.forEach(function (weekday) {
      var heading = document.createElement("span");
      heading.className = "weekday";
      heading.setAttribute("role", "columnheader");
      heading.textContent = weekday;
      grid.append(heading);
    });
    var firstDay = new Date(state.month.getFullYear(), state.month.getMonth(), 1).getDay();
    var days = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0).getDate();
    var today = dateKey(new Date());
    for (var blank = 0; blank < firstDay; blank++) {
      var empty = document.createElement("span");
      empty.className = "day empty";
      empty.setAttribute("role", "gridcell");
      grid.append(empty);
    }
    for (var day = 1; day <= days; day++) {
      var date = new Date(state.month.getFullYear(), state.month.getMonth(), day);
      var key = dateKey(date);
      var status = state.data.availability[key];
      var button = document.createElement("button");
      button.type = "button";
      button.className = "day" + (status ? " " + status : "") + (key === today ? " today" : "");
      button.textContent = String(day);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
        ": " + (status || "not set"));
      button.title = status || "Not set";
      button.disabled = key < today;
      button.addEventListener("click", function (selectedKey) {
        return function () {
          var mode = $("availability-mode").value;
          if (mode === "clear") delete state.data.availability[selectedKey];
          else state.data.availability[selectedKey] = mode;
          renderCalendar();
          renderManagedDates();
        };
      }(key));
      grid.append(button);
    }
    $("previous-month").disabled =
      state.month.getFullYear() === new Date().getFullYear() && state.month.getMonth() === new Date().getMonth();
  }

  function renderManagedDates() {
    var list = $("managed-dates");
    list.replaceChildren();
    var dates = Object.keys(state.data.availability).sort();
    if (!dates.length) {
      var empty = document.createElement("li");
      empty.textContent = "No dates set. Unmarked dates show as “Ask us” to visitors.";
      list.append(empty);
      return;
    }
    dates.forEach(function (key) {
      var item = document.createElement("li");
      var date = new Date(key + "T12:00:00");
      item.textContent = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
        " — " + (state.data.availability[key] === "available" ? "Available" : "Unavailable");
      list.append(item);
    });
  }

  function renderEditor() {
    renderPrices();
    renderReviews();
    renderCalendar();
    renderManagedDates();
  }

  function addReview() {
    state.data.reviews.push({ quote: "", author: "", rating: 5 });
    renderReviews();
    var fields = $("reviews").querySelectorAll("textarea");
    fields[fields.length - 1].focus();
  }

  function save() {
    var priceInputs = $("prices").querySelectorAll("[data-price]");
    for (var i = 0; i < priceInputs.length; i++) {
      var amount = Number(priceInputs[i].value);
      if (!Number.isFinite(amount) || amount < 0) {
        priceInputs[i].focus();
        showMessage("Enter a valid non-negative amount for each price.", "error");
        return;
      }
      state.data.prices[priceInputs[i].dataset.price] = amount;
    }
    try {
      checkedData(state.data);
      if (state.data.reviews.some(function (review) { return !review.quote.trim() || !review.author.trim(); })) {
        throw new Error("Complete the text and name for every review, or remove any blank review.");
      }
    } catch (error) {
      showMessage(error.message, "error");
      return;
    }

    var saveButton = $("save");
    saveButton.disabled = true;
    showMessage("Saving your changes to GitHub…");
    var content = JSON.stringify(state.data, null, 2) + "\n";
    githubRequest(contentUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/vnd.github+json" },
      body: JSON.stringify({
        message: "Update site content from admin editor",
        content: encodeContent(content),
        sha: state.sha,
        branch: branch
      })
    }).then(function (result) {
      state.sha = result.content.sha;
      showMessage("Saved. GitHub Pages will publish your updates shortly.", "success");
    }).catch(function (error) {
      showMessage(error.message, "error");
    }).finally(function () {
      saveButton.disabled = false;
    });
  }

  $("connect-form").addEventListener("submit", function (event) {
    event.preventDefault();
    state.token = $("token").value.trim();
    if (!state.token) return;
    var button = $("connect-form").querySelector("button");
    button.disabled = true;
    button.textContent = "Connecting…";
    loadContent().then(function () {
      sessionStorage.setItem(tokenKey, state.token);
    }).catch(function (error) {
      state.token = "";
      $("token").value = "";
      var message = document.createElement("p");
      message.className = "notice error";
      message.setAttribute("role", "alert");
      message.textContent = error.message;
      $("connect-form").append(message);
    }).finally(function () {
      button.disabled = false;
      button.textContent = "Connect and load editor";
    });
  });

  $("add-review").addEventListener("click", addReview);
  $("save").addEventListener("click", save);
  $("disconnect").addEventListener("click", function () {
    sessionStorage.removeItem(tokenKey);
    state.token = "";
    state.data = null;
    state.sha = "";
    $("editor").hidden = true;
    $("connect-panel").hidden = false;
    $("token").value = "";
  });
  $("previous-month").addEventListener("click", function () {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
    renderCalendar();
  });
  $("next-month").addEventListener("click", function () {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
    renderCalendar();
  });

  var savedToken = sessionStorage.getItem(tokenKey);
  if (savedToken) {
    state.token = savedToken;
    loadContent().catch(function (error) {
      sessionStorage.removeItem(tokenKey);
      state.token = "";
      var message = document.createElement("p");
      message.className = "notice error";
      message.setAttribute("role", "alert");
      message.textContent = error.message;
      $("connect-form").append(message);
    });
  }
}());
