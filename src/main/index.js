import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { electronApp, is } from '@electron-toolkit/utils';
import connectDB from './db.js';

let mainWindow;

async function getFamilyMembers() {
  try {
    const query = `
      SELECT fm.id, fm.full_name, fm.birth_date, fm.email, fm.phone, fm.role,
             fj.job_title, fj.employer, COALESCE(fj.salary, 0) AS salary,
             fj.start_date
      FROM family_members fm
      LEFT JOIN family_members_job fj ON fm.id = fj.family_member_id
      ORDER BY fm.id;
    `;

    const response = await global.dbclient.query(query);
    return response.rows;
  } catch (e) {
    console.error("Ошибка при получении данных о членах семьи:", e);
    return [];
  }
}

async function updateFamilyMember(_, member) {
  try {
    const updateMemberQuery = `
      UPDATE family_members
      SET full_name = $1, birth_date = $2, email = $3, phone = $4
      WHERE id = $5;
    `;

    await global.dbclient.query(updateMemberQuery, [
      member.full_name,
      member.birth_date,
      member.email || null,
      member.phone || null,
      member.id,
    ]);

    const jobCheckQuery = `SELECT COUNT(*) FROM family_members_job WHERE family_member_id = $1;`;
    const jobExists = await global.dbclient.query(jobCheckQuery, [member.id]);

    if (member.job_title || member.employer || member.salary > 0) {
      if (parseInt(jobExists.rows[0].count) > 0) {
        const updateJobQuery = `
          UPDATE family_members_job
          SET job_title = $1, employer = $2, salary = $3, start_date = $4
          WHERE family_member_id = $5;
        `;

        await global.dbclient.query(updateJobQuery, [
          member.job_title || null,
          member.employer || null,
          member.salary || 0,
          member.start_date || null,
          member.id,
        ]);
      } else {
        const insertJobQuery = `
          INSERT INTO family_members_job (family_member_id, job_title, employer, salary, start_date)
          VALUES ($1, $2, $3, $4, CURRENT_DATE);
        `;

        await global.dbclient.query(insertJobQuery, [
          member.id,
          member.job_title || null,
          member.employer || null,
          member.salary || 0,
        ]);
      }
    } else {
      const deleteJobQuery = `DELETE FROM family_members_job WHERE family_member_id = $1;`;
      await global.dbclient.query(deleteJobQuery, [member.id]);
    }

    return { success: true, message: "Член семьи обновлен" };
  } catch (e) {
    console.error("Ошибка при обновлении данных:", e);
    return { success: false, message: "Ошибка при обновлении данных" };
  }
}

async function calculateBudgetRatio(_, familyMemberId) {
  try {
    const incomeQuery = `SELECT salary FROM family_members_job WHERE family_member_id = $1 ORDER BY start_date DESC LIMIT 1;`;
    const expenseQuery = `SELECT SUM(amount) AS total_expense FROM expenses WHERE family_member_id = $1 AND transaction_date >= date_trunc('month', CURRENT_DATE);`;

    const incomeResult = await global.dbclient.query(incomeQuery, [familyMemberId]);
    const expenseResult = await global.dbclient.query(expenseQuery, [familyMemberId]);

    const income = incomeResult.rows[0]?.salary || 0;
    const expense = expenseResult.rows[0]?.total_expense || 0;

    return income > expense ? 'Профицит бюджета' : 'Дефицит бюджета';
  } catch (e) {
    console.error("Ошибка расчета:", e);
    return 'Ошибка расчета';
  }
}

async function createFamilyMember(_, member) {
  const { full_name, birth_date, email, phone, role, job_title, employer, salary } = member;
  try {
    const result = await global.dbclient.query(
      `INSERT INTO family_members (full_name, birth_date, email, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id;`,
      [full_name, birth_date, email || null, phone || null, role || null]
    );

    const familyMemberId = result.rows[0].id;

    if (job_title || employer || salary > 0) {
      await global.dbclient.query(
        `INSERT INTO family_members_job (family_member_id, job_title, employer, salary, start_date)
        VALUES ($1, $2, $3, $4, CURRENT_DATE);`,
        [familyMemberId, job_title || null, employer || null, salary || 0]
      );
    }

    dialog.showMessageBox({ message: 'Успех! Член семьи добавлен' });
  } catch (e) {
    console.error("Ошибка при добавлении члена семьи:", e);
    dialog.showErrorBox('Ошибка', 'Не удалось добавить члена семьи');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    icon: join(__dirname, '../../resources/icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron.familybudget');

  global.dbclient = await connectDB();

  ipcMain.handle('getFamilyMembers', getFamilyMembers);
  ipcMain.handle('calculateBudgetRatio', calculateBudgetRatio);
  ipcMain.handle('createFamilyMember', createFamilyMember);
  ipcMain.handle('updateFamilyMember', updateFamilyMember);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
