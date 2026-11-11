import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CurrencyPipe } from '@angular/common';
import { DialogComponent } from '../dialog/dialog.component';
import { message } from '../../auth.service';

export interface PaymentReview {
  amountCents: number;
  status: 'UNPAID' | 'PAID' | 'NOT_REQUIRED' | 'VOID';
  playerPaid: boolean | null;
  playerReviewedAt: string | null;
  organizerPaid: boolean | null;
  organizerReviewedAt: string | null;
}
@Component({
  selector: 'app-payment-review', imports: [CurrencyPipe, DialogComponent],
  templateUrl: './payment-review.component.html',
  styleUrl: './payment-review.component.scss'
})
export class PaymentReviewComponent {
  @Input({ required: true }) signupId!: string;
  @Input({ required: true }) payment!: PaymentReview;
  @Input({ required: true }) endsAt!: string;
  @Input({ required: true }) eventStatus!: string;
  @Input() playerName: string | null | undefined = '';
  readonly showReview = signal(false);
  openReview() { this.error.set(''); this.showReview.set(true); }
  @Input() compact = false;
  @Input() side: 'player' | 'organizer' = 'player';
  @Output() changed = new EventEmitter<void>();
  private readonly http = inject(HttpClient);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  label(paid: boolean | null) { return paid === null ? 'not reviewed' : paid ? 'reviewed · paid' : 'reviewed · unpaid'; }
  ended() { return new Date(this.endsAt).getTime() <= Date.now(); }
  disagrees() { return this.payment.playerPaid !== null && this.payment.organizerPaid !== null && this.payment.playerPaid !== this.payment.organizerPaid; }
  async review(paid: boolean) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      await firstValueFrom(this.http.post(`/api/signups/${this.signupId}/payment/${this.side}-review`, { paid }));
      this.showReview.set(false); this.notice.set('Your review was saved.'); this.changed.emit();
    } catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
}
