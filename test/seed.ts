/**
 * Testler için örnek okul verisi. Prototipteki demo okulu küçültülmüş hâli.
 */

import type { TestDb } from "./db";

export interface SeededSchool {
  schoolId: string;
  adminId: string;
  teacherId: string;
  teacher2Id: string;
  /** Rehberlik servisi — rehberlik verisini görebilen tek rol (0023). */
  rehberId: string;
  /** İkinci rehber: "yalnızca yazan" notların testi için. */
  rehber2Id: string;
  /** 11-A sınıfındaki öğrenciler */
  students: string[];
  /** 11-B sınıfındaki tek öğrenci — sınıf uygunluğu testleri için */
  otherClassStudentId: string;
  parentId: string;
  classAId: string;
  classBId: string;
  subjectId: string;
  topicId: string;
  roomId: string;
  room2Id: string;
  typeSoruId: string;
  typeSinifId: string;
}

let sayac = 0;
function uuid(): string {
  sayac++;
  return `00000000-0000-4000-8000-${String(sayac).padStart(12, "0")}`;
}

export async function seedSchool(db: TestDb, slug = "ornek-okul"): Promise<SeededSchool> {
  return db.asService(async (q) => {
    const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => {
      const { rows } = await q.query<T>(sql, params);
      return rows[0];
    };

    const school = await one<{ id: string }>(
      `insert into schools (slug, ad) values ($1, $2) returning id`,
      [slug, "Örnek Koleji"],
    );
    const schoolId = school.id;

    await q.query(
      `insert into school_settings (school_id, sinav_adi, sinav_tarihi)
       values ($1, 'YKS 2027', '2027-06-20')`,
      [schoolId],
    );

    // Sınıf seviyeleri
    const seviyeler = ["Hazırlık", "9. Sınıf", "10. Sınıf", "11. Sınıf", "12. Sınıf"];
    const gradeIds: Record<string, string> = {};
    for (const [i, ad] of seviyeler.entries()) {
      const g = await one<{ id: string }>(
        `insert into grade_levels (school_id, ad, sira) values ($1, $2, $3) returning id`,
        [schoolId, ad, i],
      );
      gradeIds[ad] = g.id;
    }

    const classA = await one<{ id: string }>(
      `insert into classes (school_id, kod, grade_level_id, sube) values ($1, '11-A', $2, 'A') returning id`,
      [schoolId, gradeIds["11. Sınıf"]],
    );
    const classB = await one<{ id: string }>(
      `insert into classes (school_id, kod, grade_level_id, sube) values ($1, '11-B', $2, 'B') returning id`,
      [schoolId, gradeIds["11. Sınıf"]],
    );

    const subject = await one<{ id: string }>(
      `insert into subjects (school_id, ad) values ($1, 'Matematik') returning id`,
      [schoolId],
    );
    const subject2 = await one<{ id: string }>(
      `insert into subjects (school_id, ad) values ($1, 'Kimya') returning id`,
      [schoolId],
    );
    const topic = await one<{ id: string }>(
      `insert into topics (school_id, subject_id, grade_level_id, ad, sira)
       values ($1, $2, $3, 'Türev', 1) returning id`,
      [schoolId, subject.id, gradeIds["11. Sınıf"]],
    );

    const room = await one<{ id: string }>(
      `insert into rooms (school_id, kod, kapasite) values ($1, 'B-204', 24) returning id`,
      [schoolId],
    );
    const room2 = await one<{ id: string }>(
      `insert into rooms (school_id, kod, kapasite) values ($1, 'C-110', 20) returning id`,
      [schoolId],
    );

    const typeSoru = await one<{ id: string }>(
      `insert into etut_types (school_id, ad) values ($1, 'Soru Çözümü') returning id`,
      [schoolId],
    );
    const typeSinif = await one<{ id: string }>(
      `insert into etut_types (school_id, ad) values ($1, 'Sınıf Etüdü') returning id`,
      [schoolId],
    );

    const mkUser = async (
      ad: string,
      soyad: string,
      roles: string[],
      eposta?: string,
      telefon?: string,
    ) => {
      const id = uuid();
      await q.query(`insert into auth.users (id, email) values ($1, $2)`, [
        id,
        eposta ?? `${id}@test.local`,
      ]);
      await q.query(
        `insert into users (id, school_id, ad, soyad, eposta, telefon) values ($1,$2,$3,$4,$5,$6)`,
        [id, schoolId, ad, soyad, eposta ?? null, telefon ?? null],
      );
      for (const r of roles) {
        await q.query(`insert into user_roles (user_id, school_id, role) values ($1,$2,$3)`, [
          id,
          schoolId,
          r,
        ]);
      }
      return id;
    };

    const adminId = await mkUser("Ayşe", "Yönetici", ["admin"], `admin@${slug}.test`);

    const teacherId = await mkUser("Ahmet", "Yılmaz", ["ogretmen", "mentor"], `ahmet@${slug}.test`);
    await q.query(
      `insert into teachers (user_id, school_id, brans_subject_id, mentor_mu) values ($1,$2,$3,true)`,
      [teacherId, schoolId, subject.id],
    );

    const teacher2Id = await mkUser("Selin", "Kaya", ["ogretmen"], `selin@${slug}.test`);
    await q.query(
      `insert into teachers (user_id, school_id, brans_subject_id) values ($1,$2,$3)`,
      [teacher2Id, schoolId, subject2.id],
    );

    const rehberId = await mkUser("Nalan", "Rehber", ["rehber"], `rehber@${slug}.test`);
    const rehber2Id = await mkUser("Sibel", "Rehber", ["rehber"], `rehber2@${slug}.test`);

    const students: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = await mkUser(`Öğrenci${i + 1}`, "Test", ["ogrenci"]);
      await q.query(
        `insert into students (user_id, school_id, okul_no, class_id, mentor_teacher_id)
         values ($1,$2,$3,$4,$5)`,
        [id, schoolId, String(200 + i), classA.id, teacherId],
      );
      students.push(id);
    }

    const otherClassStudentId = await mkUser("Başka", "Sınıf", ["ogrenci"]);
    await q.query(
      `insert into students (user_id, school_id, okul_no, class_id) values ($1,$2,'300',$3)`,
      [otherClassStudentId, schoolId, classB.id],
    );

    // İçe aktarım telefonu +90XXXXXXXXXX olarak normalize ediyor; tohumlama da öyle olmalı.
  const parentId = await mkUser(
    "Hakan",
    "Veli",
    ["veli"],
    undefined,
    `+90532${String(1000000 + sayac).slice(0, 7)}`,
  );
    await q.query(
      `insert into parent_students (parent_user_id, student_id, school_id, yakinlik)
       values ($1,$2,$3,'baba')`,
      [parentId, students[0], schoolId],
    );

    return {
      schoolId,
      adminId,
      teacherId,
      teacher2Id,
      rehberId,
      rehber2Id,
      students,
      otherClassStudentId,
      parentId,
      classAId: classA.id,
      classBId: classB.id,
      subjectId: subject.id,
      topicId: topic.id,
      roomId: room.id,
      room2Id: room2.id,
      typeSoruId: typeSoru.id,
      typeSinifId: typeSinif.id,
    };
  });
}

/**
 * Gelecek haftanın bir gününü döndürür (okul saat dilimine göre).
 * Testlerin "geçmiş etüt" sınırına takılmaması için hep ileri bir tarih verir.
 */
export async function gelecekHaftaTarihi(db: TestDb, gunEkle = 0): Promise<string> {
  return db.asService(async (q) => {
    const { rows } = await q.query<{ d: string }>(
      `select to_char(
         ((now() at time zone 'Europe/Istanbul')::date
           - (extract(isodow from (now() at time zone 'Europe/Istanbul')::date)::int - 1)
           + 7 + $1::int),
         'YYYY-MM-DD') as d`,
      [gunEkle],
    );
    return rows[0].d;
  });
}

/** Etüt oluşturur ve uygun sınıfları bağlar. */
export async function createEtut(
  db: TestDb,
  s: SeededSchool,
  opts: {
    tarih: string;
    baslangic?: string;
    bitis?: string;
    kontenjan?: number;
    teacherId?: string;
    roomId?: string | null;
    durum?: string;
    sinifEtudu?: boolean;
    classes?: string[];
    typeId?: string;
  },
): Promise<string> {
  return db.asService(async (q) => {
    const { rows } = await q.query<{ id: string }>(
      `insert into etuts
         (school_id, teacher_id, subject_id, topic_id, etut_type_id, room_id,
          tarih, baslangic, bitis, kontenjan, sinif_etudu_mu, durum, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$2)
       returning id`,
      [
        s.schoolId,
        opts.teacherId ?? s.teacherId,
        s.subjectId,
        s.topicId,
        opts.typeId ?? s.typeSoruId,
        opts.roomId === undefined ? s.roomId : opts.roomId,
        opts.tarih,
        opts.baslangic ?? "16:00",
        opts.bitis ?? "17:00",
        opts.kontenjan ?? 12,
        opts.sinifEtudu ?? false,
        opts.durum ?? "onaylandi",
      ],
    );
    const etutId = rows[0].id;
    for (const c of opts.classes ?? [s.classAId]) {
      await q.query(
        `insert into etut_eligible_classes (etut_id, class_id) values ($1,$2)`,
        [etutId, c],
      );
    }
    return etutId;
  });
}
