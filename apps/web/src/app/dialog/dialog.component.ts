import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';
let nextDialogId = 0;
@Component({
  selector: 'app-dialog',
  template: `<dialog #dialog [attr.aria-labelledby]="headingId" (cancel)="cancel($event)" (close)="nativeClosed()">
    <div class="dialog-header"><h2 [id]="headingId">{{ title }}</h2><button type="button" class="secondary" [disabled]="busy" (click)="closed.emit()" aria-label="Close dialog">Close</button></div>
    <ng-content />
  </dialog>`,
  styles: ['dialog { position: fixed; inset: 0; margin: auto; width: min(42rem, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; color: var(--text); background: var(--surface); box-shadow: 0 24px 80px var(--dialog-shadow); } dialog:not([open]) { display: none; } dialog::backdrop { background: var(--backdrop); } .dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; } h2 { font-size: 1.25rem; font-weight: 700; }']
})
export class DialogComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() open = false;
  @Input() title = '';
  @Input() busy = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('dialog') element?: ElementRef<HTMLDialogElement>;
  readonly headingId = `dialog-heading-${++nextDialogId}`;
  ngAfterViewInit() { this.sync(); }
  ngOnChanges() { this.sync(); }
  private sync() { const dialog = this.element?.nativeElement; if (!dialog) return; if (this.open && !dialog.open) dialog.showModal(); else if (!this.open && dialog.open) dialog.close(); }
  cancel(event: Event) { event.preventDefault(); if (!this.busy) this.closed.emit(); }
  nativeClosed() { if (this.open && !this.busy) this.closed.emit(); }
  ngOnDestroy() { if (this.element?.nativeElement.open) this.element.nativeElement.close(); }
}
