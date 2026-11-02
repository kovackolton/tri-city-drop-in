import { BadRequestException, Body, ConflictException, Controller, Delete, Inject, Injectable, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdministratorGuard, FirebaseGuard, OrganizerGuard } from './auth';
import { Database } from './database';
import { locationPhotoUrl, locationMapUrl } from './location-media';
import { object, text, uuid } from './validation';
export function locationInput(value: unknown) {
  const b = object(value, ['name', 'address', 'timezone', 'photoUrl', 'photoCredit', 'mapEmbedUrl']);
  const timezone = text(b.timezone, 'Timezone', 100);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { throw new BadRequestException('Use a valid IANA timezone.'); }
  const media = {
    ...(b.photoUrl === undefined ? {} : { photoUrl: locationPhotoUrl(b.photoUrl) }),
    ...(b.photoCredit === undefined ? {} : { photoCredit: b.photoCredit === '' || b.photoCredit === null ? null : text(b.photoCredit, 'Photo credit', 160) }),
    ...(b.mapEmbedUrl === undefined ? {} : { mapEmbedUrl: locationMapUrl(b.mapEmbedUrl) })
  };
  return { ...media, name: text(b.name, 'Name').replace(/\s+/g, ' '), address: text(b.address, 'Address', 400).replace(/\s+/g, ' '), timezone };
}
@Injectable()
export class LocationsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async check(value: unknown, excludeId?: string) {
    const data = locationInput(value);
    const rows = await this.db.$queryRaw<{ id: string; name: string; address: string }[]>`SELECT "id", "name", "address" FROM "Location" WHERE location_identity("name") = location_identity(${data.name}) AND location_identity("address") = location_identity(${data.address})`;
    return { duplicate: rows.find(r => r.id !== excludeId) ?? null };
  }
  async save(value: unknown, id?: string) {
    if (id) uuid(id);
    const data = locationInput(value);
    if ((await this.check(data, id)).duplicate) throw new ConflictException('This location already exists. Use the existing location.');
    try { return id ? await this.db.location.update({ where: { id }, data }) : await this.db.location.create({ data }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This location already exists.');
      throw error;
    }
  }
  async remove(id: string) {
    uuid(id);
    try { return await this.db.location.delete({ where: { id } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new ConflictException('This location is used by events and cannot be deleted. Reassign those events first.');
      throw error;
    }
  }
}
@Controller('api/locations') @UseGuards(FirebaseGuard, OrganizerGuard)
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly service: LocationsService) {}
  @Post('check') check(@Body() value: unknown) { return this.service.check(value); }
  @Post() create(@Body() value: unknown) { return this.service.save(value); }
  @Patch(':id') @UseGuards(AdministratorGuard) edit(@Param('id') id: string, @Body() value: unknown) { return this.service.save(value, id); }
  @Delete(':id') @UseGuards(AdministratorGuard) remove(@Param('id') id: string) { return this.service.remove(id); }
}
