/*
  Small progressive-enhancement layer for the ACNH museum tracker.
  Existing inline JavaScript remains responsible for search, filters, counts,
  localStorage records, modal data, import, and export.
*/

(function () {
  "use strict";

  const selectors = {
    categoryNav: "#categoryNav",
    filters: "#filters",
    grid: "#grid",
    modal: "#modal",
    closeModal: "#closeModal",
    toolbar: ".toolbar",
    actions: ".actions",
  };

  const statusTitles = {
    need: "还没有捐给博物馆",
    lack: "数量还没有达到保留目标",
    done: "已满足当前保留目标",
    sell: "超过保留目标，可以考虑售卖",
  };

  let lastFocusedElement = null;
  let toastTimer = 0;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    document.body.classList.add("acnh-polished");

    addEnhanceBar();
    addBackToTopButton();
    enhanceStaticControls();
    observeGrid();
    observeModal();
    observeStats();
    bindSoftInteractions();
    updateFilterSummary();
  }

  function addEnhanceBar() {
    const toolbar = document.querySelector(selectors.toolbar);
    if (!toolbar || document.querySelector(".acnh-enhance-bar")) return;

    const bar = document.createElement("div");
    bar.className = "acnh-enhance-bar";
    bar.innerHTML = `
      <div class="acnh-filter-summary" aria-live="polite">当前筛选：全部</div>
    `;

    toolbar.insertAdjacentElement("afterend", bar);
  }

  function addBackToTopButton() {
    if (document.querySelector(".acnh-top-button")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "acnh-top-button";
    button.textContent = "↑";
    button.setAttribute("aria-label", "回到顶部");
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    document.body.appendChild(button);

    window.addEventListener(
      "scroll",
      () => {
        button.classList.toggle("is-visible", window.scrollY > 520);
      },
      { passive: true },
    );
  }

  function enhanceStaticControls() {
    document.querySelector("#exportBtn")?.setAttribute("title", "导出当前浏览器保存的收集记录");
    document.querySelector("#importBtn")?.setAttribute("title", "导入之前导出的收集记录");
    document.querySelector("#resetBtn")?.setAttribute("title", "清空当前浏览器中的本工具记录");
    document.querySelector(selectors.categoryNav)?.setAttribute("aria-label", "博物馆分类");
  }

  function observeGrid() {
    const grid = document.querySelector(selectors.grid);
    if (!grid) return;

    const revealObserver =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("acnh-reveal");
                revealObserver.unobserve(entry.target);
              });
            },
            { rootMargin: "80px 0px" },
          )
        : null;

    const enhanceCards = () => {
      grid.querySelectorAll(".card").forEach((card, index) => {
        if (!card.dataset.acnhEnhanced) {
          card.dataset.acnhEnhanced = "true";
          card.style.animationDelay = `${Math.min(index * 18, 180)}ms`;
          revealObserver?.observe(card);
        }

        const status = card.querySelector(".status");
        if (status) {
          const key = Array.from(status.classList).find((item) => statusTitles[item]);
          if (key) status.setAttribute("title", statusTitles[key]);
        }

        card.querySelectorAll(".mini").forEach((button) => {
          if (button.dataset.act === "inc") button.setAttribute("aria-label", "增加拥有数量");
          if (button.dataset.act === "dec") button.setAttribute("aria-label", "减少拥有数量");
        });
      });
    };

    enhanceCards();
    new MutationObserver(enhanceCards).observe(grid, { childList: true, subtree: true });
  }

  function observeModal() {
    const modal = document.querySelector(selectors.modal);
    if (!modal) return;

    new MutationObserver(() => {
      if (modal.classList.contains("open")) {
        lastFocusedElement = document.activeElement;
        window.setTimeout(() => {
          enhanceDetailStats();
          document.querySelector(selectors.closeModal)?.focus();
        }, 0);
      } else if (lastFocusedElement instanceof HTMLElement) {
        lastFocusedElement.focus({ preventScroll: true });
        lastFocusedElement = null;
      }
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  function enhanceDetailStats() {
    const info = document.querySelector("#modalInfo");
    if (!info) return;

    const countCell = Array.from(info.children).find(
      (cell) => cell.querySelector("span")?.textContent?.trim() === "当前数量",
    );
    if (!countCell || countCell.dataset.acnhDetailStats === "true") return;

    const rawText = Array.from(countCell.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .join(" ");

    const metrics = Array.from(rawText.matchAll(/(拥有|需留|缺|可售)\s*(\d+)/g)).map((match) => ({
      label: match[1],
      value: match[2],
    }));

    if (!metrics.length) return;

    const label = countCell.querySelector("span")?.outerHTML || "<span>当前数量</span>";
    countCell.classList.add("detail-stat-card");
    countCell.dataset.acnhDetailStats = "true";
    countCell.innerHTML = `
      ${label}
      <div class="detail-stat-grid" aria-label="当前物品数量统计">
        ${metrics
          .map(
            (metric) => `
              <div class="detail-stat-metric detail-stat-${metric.label}">
                <small>${metric.label}</small>
                <b>${metric.value}</b>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function observeStats() {
    const roots = ["#stats", "#globalStats", "#modalInfo"]
      .map((selector) => document.querySelector(selector))
      .filter(Boolean);

    if (!roots.length) return;

    const update = () => {
      document.querySelectorAll(".stat b, .badge b, .detail-stat-metric b").forEach(animateNumberElement);
    };

    roots.forEach((root) => {
      new MutationObserver(update).observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });

    update();
  }

  function animateNumberElement(element) {
    const value = element.textContent.trim();
    if (!value || element.dataset.acnhValue === value || element.dataset.acnhAnimating === "true") return;

    const match = value.match(/^(\d+)(.*)$/);
    element.dataset.acnhValue = value;

    const container = element.closest(".stat, .badge");
    container?.classList.add("is-counting");
    window.setTimeout(() => container?.classList.remove("is-counting"), 620);

    if (!match || !("requestAnimationFrame" in window)) return;

    const target = Number(match[1]);
    const suffix = match[2] || "";
    const start = Number(element.dataset.acnhNumber || 0);
    const duration = Math.min(720, Math.max(360, Math.abs(target - start) * 18));
    const startedAt = performance.now();

    element.dataset.acnhAnimating = "true";

    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (target - start) * eased);
      element.textContent = `${current}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(tick);
        return;
      }

      element.textContent = value;
      element.dataset.acnhNumber = String(target);
      element.dataset.acnhAnimating = "false";
    };

    requestAnimationFrame(tick);
  }

  function bindSoftInteractions() {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const modal = document.querySelector(selectors.modal);
        if (modal?.classList.contains("open")) {
          document.querySelector(selectors.closeModal)?.click();
        }
      }
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest("#exportBtn")) showToast("收集记录已开始导出");
      if (event.target.closest("#importBtn")) showToast("请选择要导入的记录文件");
      if (event.target.closest("#categoryNav [data-cat]")) {
        window.setTimeout(() => {
          updateFilterSummary();
          document.querySelector(selectors.toolbar)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 0);
      }
    });

    document.addEventListener("input", (event) => {
      if (event.target.closest(selectors.filters)) updateFilterSummary();
      if (event.target.closest(selectors.grid)) showSavedSoon();
    });

    document.addEventListener("change", (event) => {
      if (event.target.closest(selectors.filters)) updateFilterSummary();
      if (event.target.closest(selectors.grid)) showSavedSoon();
      if (event.target.id === "importFile") showToast("导入完成后页面会自动刷新记录");
    });
  }

  function updateFilterSummary() {
    const summary = document.querySelector(".acnh-filter-summary");
    const filters = document.querySelector(selectors.filters);
    if (!summary || !filters) return;

    const activeCategory = document.querySelector(".cat.active span")?.textContent?.trim() || "当前分类";
    const active = [];

    filters.querySelectorAll("[data-filter]").forEach((control) => {
      const label = control.closest(".field")?.querySelector("span")?.textContent?.trim();
      if (!label) return;

      let value = control.value;
      if (!value || value === "all") return;
      if (control.tagName === "SELECT") {
        value = control.selectedOptions[0]?.textContent?.trim() || value;
      }
      active.push(`${label}: ${value}`);
    });

    summary.textContent = `${activeCategory}筛选：${active.length ? active.join("，") : "全部"}`;
  }

  function showSavedSoon() {
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => showToast("记录已保存到当前浏览器"), 220);
  }

  function showToast(message) {
    let toast = document.querySelector(".acnh-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "acnh-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toast.hideTimer);
    toast.hideTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  function isTypingTarget(target) {
    return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }
})();
