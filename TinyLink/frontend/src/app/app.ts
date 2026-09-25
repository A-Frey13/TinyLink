import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

type ShortenResponse = {
  shortUrl: string;
  shortCode: string;
  originalUrl: string;
  createdAt: string;
  expiresAt: string | null;
};

type UrlStats = {
  shortCode: string;
  originalUrl: string;
  clickCount: number;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
  createdBy: string;
};

@Component({
  selector: 'app-root',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.html',
  standalone: true,
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly form = this.formBuilder.group({
    originalUrl: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/i)]],
    customAlias: [''],
    expiresAt: [''],
  });

  protected readonly statsForm = this.formBuilder.group({
    shortCode: ['', Validators.required],
  });

  protected readonly loading = signal(false);
  protected readonly statsLoading = signal(false);
  protected readonly error = signal('');
  protected readonly statsError = signal('');
  protected readonly result = signal<ShortenResponse | null>(null);
  protected readonly stats = signal<UrlStats | null>(null);

  protected shortenUrl(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload = {
      // "", ?? => "", || => null
      originalUrl: raw.originalUrl ?? '',
      customAlias: raw.customAlias || null,
      expiresAt: raw.expiresAt ? this.toLocalDateTime(raw.expiresAt) : null,
    };

    this.loading.set(true);
    this.error.set('');
    this.result.set(null);

    this.http.post<ShortenResponse>('/api/shorten', payload).subscribe({
      next: (response) => {
        this.result.set(response);
        this.statsForm.patchValue({ shortCode: response.shortCode });
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.error ?? 'Failed to create short URL.');
        this.loading.set(false);
      },
    });
  }

  protected loadStats(): void {
    if (this.statsForm.invalid) {
      this.statsForm.markAllAsTouched();
      return;
    }

    const shortCode = this.statsForm.getRawValue().shortCode ?? '';

    this.statsLoading.set(true);
    this.statsError.set('');
    this.stats.set(null);

    this.http.get<UrlStats>(`/api/stats/${shortCode}`).subscribe({
      next: (response) => {
        this.stats.set(response);
        this.statsLoading.set(false);
      },
      error: (error) => {
        this.statsError.set(error?.error.error ?? 'Failed to fetch stats.');
        this.statsLoading.set(false);
      },
    });
  }

  private toLocalDateTime(expiresAt: string) {
    return expiresAt.length === 16 ? `${expiresAt}:00` : expiresAt;
  }
}
