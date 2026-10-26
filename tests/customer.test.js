import { describe, expect, it } from 'vitest';
import { formatPhone, validateName, validatePhone } from '../src/utils/customer.js';
import { buildIcs } from '../src/utils/ics.js';
import { bookingMessage, whatsappLink } from '../src/utils/whatsapp.js';

describe('nome', () => {
  it('limpa espaços e recusa vazio, curto, comprido ou sem letras', () => {
    expect(validateName('  Ana   Maria ')).toEqual({ value: 'Ana Maria' });
    expect(validateName('').error).toBeTruthy();
    expect(validateName('A').error).toBeTruthy();
    expect(validateName('x'.repeat(61)).error).toBeTruthy();
    expect(validateName('12345').error).toBeTruthy();
  });
});

describe('WhatsApp', () => {
  it('aceita os jeitos comuns de escrever e guarda com 55', () => {
    expect(validatePhone('(11) 91234-5678')).toEqual({ value: '5511912345678' });
    expect(validatePhone('+55 21 98765-4321')).toEqual({ value: '5521987654321' });
    expect(validatePhone('011912345678')).toEqual({ value: '5511912345678' });
    expect(validatePhone('1132345678')).toEqual({ value: '551132345678' }); // fixo
  });

  it('explica o que está errado', () => {
    expect(validatePhone('').error).toMatch(/DDD/);
    expect(validatePhone('912345678').error).toMatch(/DDD/);
    expect(validatePhone('11812345678').error).toMatch(/começa com 9/);
    expect(validatePhone('0912345678').error).toMatch(/DDD|número/);
  });

  it('formata para mostrar', () => {
    expect(formatPhone('5511912345678')).toBe('(11) 91234-5678');
  });

  it('monta a mensagem e o link sem quebrar acentos', () => {
    const msg = bookingMessage({
      shopName: 'Barbearia Alvorada',
      service: { name: 'Corte + barba' },
      barber: { name: 'Lia' },
      date: '2026-10-30',
      time: '14:30',
      name: 'João',
    });
    expect(msg).toContain('Corte + barba com Lia');
    expect(msg).toContain('sexta-feira, 30/10 às 14:30');
    const link = whatsappLink('5511912345678', msg);
    expect(link.startsWith('https://wa.me/5511912345678?text=')).toBe(true);
    expect(decodeURIComponent(link.split('text=')[1])).toBe(msg);
  });
});

describe('arquivo de agenda (.ics)', () => {
  it('gera o evento em UTC, com lembrete e texto escapado', () => {
    const ics = buildIcs({
      uid: 'abc@alvorada',
      startsAt: new Date('2026-10-30T17:30:00Z'),
      endsAt: new Date('2026-10-30T18:10:00Z'),
      summary: 'Corte, Barbearia Alvorada',
      description: 'Linha 1\nLinha 2; fim',
      now: new Date('2026-10-26T12:00:00Z'),
    });
    expect(ics).toContain('DTSTART:20261030T173000Z');
    expect(ics).toContain('DTEND:20261030T181000Z');
    expect(ics).toContain('SUMMARY:Corte\\, Barbearia Alvorada');
    expect(ics).toContain('DESCRIPTION:Linha 1\\nLinha 2\\; fim');
    expect(ics).toContain('TRIGGER:-PT1H');
    expect(ics.split('\r\n').at(-1)).toBe('');
  });
});
