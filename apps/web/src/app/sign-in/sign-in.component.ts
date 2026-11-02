import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../auth.service';

@Component({
  selector: 'app-sign-in',
  imports: [FormsModule],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss'
})
export class SignInComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  mode: 'signin' | 'register' | 'reset' = 'signin';
  email = '';
  password = '';
  confirmation = '';
  setMode(mode: 'signin' | 'register' | 'reset') {
    this.clearPasswords(); this.mode = mode; this.auth.error.set(''); this.auth.notice.set('');
  }
  private clearPasswords() { this.password = ''; this.confirmation = ''; }
  ngOnDestroy() { this.clearPasswords(); }
  async submit(form: NgForm) {
    if (this.auth.busy()) return;
    if (form.invalid) { form.control.markAllAsTouched(); return; }
    if (this.mode === 'register' && this.password !== this.confirmation) { this.auth.error.set('Your passwords do not match.'); return; }
    const password = this.password;
    this.clearPasswords();
    if (this.mode === 'reset') await this.auth.resetPassword(this.email);
    else if (this.mode === 'register') await this.auth.register(this.email, password);
    else await this.auth.loginEmail(this.email, password);
  }
  async google() { this.clearPasswords(); await this.auth.login(); }
}
