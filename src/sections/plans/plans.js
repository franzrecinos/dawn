import './plans.css';

class NmPlanGrid extends HTMLElement {
  constructor() {
    super();
    this.cards = this.querySelectorAll('.nm-plan');
  }

  connectedCallback() {
    this.cards.forEach((card) => {
      card.addEventListener('mouseenter', () => card.style.setProperty('--nm-plan-hovered', '1'));
      card.addEventListener('mouseleave', () => card.style.removeProperty('--nm-plan-hovered'));
    });
  }
}

if (!customElements.get('nm-plan-grid')) {
  customElements.define('nm-plan-grid', NmPlanGrid);
}
