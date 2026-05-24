const express = require('express');
const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const redisClient = createClient({
  socket: {
    host: 'redis-server',
    port: 6379,
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
  }
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Connecté à Redis'));

async function initRedis() {
  await redisClient.connect();
  const count = await redisClient.sCard('employees');
  if (count === 0) {
    const employees = [
      { id: uuidv4(), nom: 'Dupont', prenom: 'Alice', poste: 'Développeuse', departement: 'Informatique', email: 'alice@entreprise.com', telephone: '0612345678', salaire: '65000' },
      { id: uuidv4(), nom: 'Martin', prenom: 'Baptiste', poste: 'Chef de Projet', departement: 'Management', email: 'baptiste@entreprise.com', telephone: '0698765432', salaire: '72000' },
    ];
    for (const emp of employees) {
      await redisClient.hSet(`employee:${emp.id}`, emp);
      await redisClient.sAdd('employees', emp.id);
    }
  }
}

app.get('/', async (req, res) => {
  const visits = await redisClient.incr('visits');
  const ids = await redisClient.sMembers('employees');
  const employees = [];
  for (const id of ids) {
    const emp = await redisClient.hGetAll(`employee:${id}`);
    if (emp && emp.id) employees.push(emp);
  }
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Gestion Employés</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; background: #f5f5f5; }
    h1 { color: #333; }
    .visits { background: #4CAF50; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    th { background: #333; color: white; padding: 12px; text-align: left; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    tr:hover { background: #f9f9f9; }
    .btn { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; }
    .btn-edit { background: #2196F3; color: white; }
    .btn-delete { background: #f44336; color: white; }
    .form-section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    input { padding: 8px; margin: 4px; border: 1px solid #ddd; border-radius: 4px; }
    .btn-add { background: #4CAF50; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Gestion des Employés</h1>
  <div class="visits">Visites : ${visits}</div>

  <div class="form-section">
    <h3>Ajouter un employé</h3>
    <input id="prenom" placeholder="Prénom">
    <input id="nom" placeholder="Nom">
    <input id="poste" placeholder="Poste">
    <input id="departement" placeholder="Département">
    <input id="email" placeholder="Email">
    <button class="btn btn-add" onclick="ajouterEmploye()">Ajouter</button>
  </div>

  <table>
    <thead><tr><th>Prénom</th><th>Nom</th><th>Poste</th><th>Département</th><th>Email</th><th>Actions</th></tr></thead>
    <tbody id="tbody">
      ${employees.map(e => `
        <tr>
          <td>${e.prenom}</td>
          <td>${e.nom}</td>
          <td>${e.poste}</td>
          <td>${e.departement}</td>
          <td>${e.email}</td>
          <td>
            <button class="btn btn-edit" onclick="modifierEmploye('${e.id}')">Modifier</button>
            <button class="btn btn-delete" onclick="supprimerEmploye('${e.id}')">Supprimer</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>

  <script>
    async function ajouterEmploye() {
      const data = {
        prenom: document.getElementById('prenom').value,
        nom: document.getElementById('nom').value,
        poste: document.getElementById('poste').value,
        departement: document.getElementById('departement').value,
        email: document.getElementById('email').value,
      };
      await fetch('/api/employees', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
      location.reload();
    }

    async function supprimerEmploye(id) {
      if (confirm('Supprimer cet employé ?')) {
        await fetch('/api/employees/' + id, { method: 'DELETE' });
        location.reload();
      }
    }

    async function modifierEmploye(id) {
      const prenom = prompt('Nouveau prénom :');
      const nom = prompt('Nouveau nom :');
      const poste = prompt('Nouveau poste :');
      if (prenom && nom && poste) {
        await fetch('/api/employees/' + id, {
          method: 'PUT',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ prenom, nom, poste })
        });
        location.reload();
      }
    }
  </script>
</body>
</html>`);
});

app.get('/api/employees', async (req, res) => {
  const ids = await redisClient.sMembers('employees');
  const employees = [];
  for (const id of ids) {
    const emp = await redisClient.hGetAll(`employee:${id}`);
    if (emp && emp.id) employees.push(emp);
  }
  res.json(employees);
});

app.post('/api/employees', async (req, res) => {
  const { nom, prenom, poste, departement, email } = req.body;
  const id = uuidv4();
  const emp = { id, nom, prenom, poste, departement: departement || '', email: email || '' };
  await redisClient.hSet(`employee:${id}`, emp);
  await redisClient.sAdd('employees', id);
  res.status(201).json(emp);
});

app.put('/api/employees/:id', async (req, res) => {
  const { nom, prenom, poste, departement, email } = req.body;
  const updates = {};
  if (nom) updates.nom = nom;
  if (prenom) updates.prenom = prenom;
  if (poste) updates.poste = poste;
  if (departement) updates.departement = departement;
  if (email) updates.email = email;
  await redisClient.hSet(`employee:${req.params.id}`, updates);
  res.json({ message: 'Modifié' });
});

app.delete('/api/employees/:id', async (req, res) => {
  await redisClient.del(`employee:${req.params.id}`);
  await redisClient.sRem('employees', req.params.id);
  res.json({ message: 'Supprimé' });
});

initRedis().then(() => {
  app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
});
