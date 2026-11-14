import { Directive, ElementRef, HostListener, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { NgForm } from '@angular/forms';
let feedbackId = 0;
const owners = new WeakMap<Element, () => void>();
function owner(element: Element) {
  let current = element.parentElement;
  while (current && (!current.tagName.startsWith('APP-') || current.tagName === 'APP-DIALOG')) current = current.parentElement;
  return current ?? element.closest('form') ?? element;
}
function claim(element: Element, clear: () => void) { const scope = owner(element); owners.get(scope)?.(); owners.set(scope, clear); }
function show(button: HTMLElement, text: string, announce: boolean) {
  const paragraph = button.ownerDocument.createElement('p'); paragraph.id = `action-feedback-${++feedbackId}`;
  paragraph.className = 'notice error action-feedback mt-3'; paragraph.textContent = text;
  if (announce) paragraph.setAttribute('role', 'alert');
  paragraph.style.flexBasis = '100%'; paragraph.style.whiteSpace = 'normal';
  button.insertAdjacentElement('afterend', paragraph);
  button.setAttribute('aria-describedby', [button.getAttribute('aria-describedby'), paragraph.id].filter(Boolean).join(' '));
  return () => { const ids = (button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== paragraph.id); ids.length ? button.setAttribute('aria-describedby', ids.join(' ')) : button.removeAttribute('aria-describedby'); paragraph.remove(); };
}
/** Mirrors an existing announced error beside the last action; the original alert stays the announcement source. */
@Directive({ selector: 'button[appActionError],select[appActionError]' })
export class ActionErrorDirective implements OnChanges, OnDestroy {
  @Input('appActionError') error: string | null | undefined = '';
  private readonly button = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private active = false; private remove?: () => void;
  private clear = () => { this.active = false; this.remove?.(); this.remove = undefined; };
  @HostListener('app-feedback-action') submitted() { this.activate(); }
  @HostListener('change') changed() { this.activate(); }
  @HostListener('click') activate() { claim(this.button, this.clear); this.active = true; this.render(); }
  ngOnChanges() { if (this.active) this.render(); }
  private render() { this.remove?.(); this.remove = this.error ? show(this.button, this.error, false) : undefined; }
  ngOnDestroy() { this.clear(); if (owners.get(owner(this.button)) === this.clear) owners.delete(owner(this.button)); }
}
/** Places native/Angular validation feedback beside the submit button and blocks invalid submissions. */
@Directive({ selector: 'form[appFormFeedback]' })
export class FormFeedbackDirective implements OnDestroy {
  private readonly form = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;
  private readonly ngForm = inject(NgForm, { optional: true, self: true });
  private button?: HTMLButtonElement; private remove?: () => void;
  private clear = () => { this.remove?.(); this.remove = undefined; };
  private click = (event: Event) => { const target = event.target as HTMLElement; const button = target.closest<HTMLButtonElement>('button'); if (button?.form === this.form && button.type === 'submit') this.button = button; };
  private invalid = () => this.feedback();
  private submit = (event: Event) => {
    this.button = (event as SubmitEvent).submitter instanceof HTMLButtonElement ? (event as SubmitEvent).submitter as HTMLButtonElement : this.button;
    this.button ??= this.form.querySelector<HTMLButtonElement>('button[type="submit"],button:not([type])') ?? undefined;
    if (this.invalidField() || this.ngForm?.invalid) { event.preventDefault(); event.stopImmediatePropagation(); this.ngForm?.form.markAllAsTouched(); this.feedback(); } else { this.clear(); if (this.button) { const action = this.form.ownerDocument.createEvent('Event'); action.initEvent('app-feedback-action', false, false); this.button.dispatchEvent(action); } }
  };
  private input = () => { if (this.remove) queueMicrotask(() => { if (!this.invalidField() && !this.ngForm?.invalid) this.clear(); }); };
  constructor() {
    this.form.addEventListener('click', this.click, true); this.form.addEventListener('invalid', this.invalid, true);
    this.form.addEventListener('submit', this.submit, true); this.form.addEventListener('input', this.input); this.form.addEventListener('change', this.input);
  }
  private invalidField() { return Array.from(this.form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')).find(field => field.willValidate && !field.validity.valid); }
  private feedback() {
    const button = this.button ?? this.form.querySelector<HTMLButtonElement>('button[type="submit"],button:not([type])'); if (!button) return;
    const field = this.invalidField(); let details = field?.closest('details'); while (details) { details.open = true; details = details.parentElement?.closest('details') ?? null; }
    const label = field?.labels?.[0]?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80);
    const text = field?.validationMessage ? `${label ? label + ': ' : ''}${field.validationMessage}` : 'Review the highlighted fields before continuing.';
    claim(button, this.clear); this.clear(); this.remove = show(button, text, true);
  }
  ngOnDestroy() {
    this.clear(); if (owners.get(owner(this.form)) === this.clear) owners.delete(owner(this.form)); this.form.removeEventListener('click', this.click, true); this.form.removeEventListener('invalid', this.invalid, true);
    this.form.removeEventListener('submit', this.submit, true); this.form.removeEventListener('input', this.input); this.form.removeEventListener('change', this.input);
  }
}
