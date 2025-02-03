import express from 'express';
import mssql from 'mssql'; // Importa mssql correctamente
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import session from 'express-session';


// Obtén la ruta absoluta de la carpeta actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de Multer para almacenamiento
const storage = multer.memoryStorage(); // Usar memoria para almacenar el archivo temporalmente
const upload = multer({ storage: storage });
const router = express.Router();


const app = express();
const port = 3000;


app.use(session({
  secret: 'tu_secreto_aqui',
  resave: false,
  saveUninitialized: false
}));


// Configuración de body-parser (Ahora express lo maneja por defecto)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());  // Para manejar JSON también

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta para servir el archivo galeto.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'galeto.html'));
});

// Ruta para servir la página de inicio
app.get('/inicio', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'inicio.html'));
});


// Configuración de conexión a la base de datos
const dbConfig = {
    user: 'admin',  // Reemplaza con tu usuario de SQL Server
    password: '123',  // Reemplaza con tu contraseña de SQL Server
    server: 'localhost',  // O la dirección de tu servidor SQL
    database: 'LoginSystem',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

// Conectar a la base de datos
mssql.connect(dbConfig)
    .then(() => {
        console.log('Conectado a SQL Server');
    })
    .catch(err => {
        console.log('Error de conexión a la base de datos:', err);
    });

    
// Ruta para manejar el registro de usuarios
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Crear una solicitud SQL
        const request = new mssql.Request();

        // Declarar los parámetros
        request.input('username', mssql.NVarChar, username);
        request.input('email', mssql.NVarChar, email);

        // Encriptar la contraseña proporcionada con SHA-256
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        request.input('hashedPassword', mssql.NVarChar, hashedPassword);

        // Insertar el nuevo usuario
        await request.query(`
            INSERT INTO Users (Username, Email, Password)
            VALUES (@username, @email, @hashedPassword)
        `);

        // Redirigir al login después del registro exitoso
        res.redirect('/');
    } catch (error) {
        console.log('Error al registrar el usuario:', error);
        res.status(500).send('Error interno');
    }
});

// Ruta para manejar el registro de usuarios
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const request = new mssql.Request();
    request.input('username', mssql.NVarChar, username);

    const result = await request.query(`
      SELECT UserID, Password FROM Users WHERE Username = @username
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'El usuario no existe.' });
    }

    const usuarioEncontrado = result.recordset[0];
    const storedPassword = usuarioEncontrado.Password;
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    if (storedPassword === hashedPassword) {
      req.session.userId = usuarioEncontrado.UserID;
      console.log("Usuario logueado, sesión:", req.session); // Verifica aquí el contenido de la sesión
      res.json({ success: true, redirect: '/inicio' });
    } else {
      res.status(401).json({ success: false, message: 'Contraseña incorrecta.' });
    }
  } catch (error) {
    console.log('Error al consultar la base de datos:', error);
    res.status(500).json({ success: false, message: 'Error interno' });
  }
});



// Ruta para subir la imagen con categorías
app.post('/upload', upload.single('image'), async (req, res) => {
    const { file, body } = req;

    if (!file) {
        return res.status(400).send('No se subió ninguna imagen.');
    }

    const imageBuffer = file.buffer;
    const description = body.description;
    const username = body.username;
    const song1 = body.song1;
    const song2 = body.song2;
    const song3 = body.song3;
    const songTitle1 = body.songTitle1;
    const songTitle2 = body.songTitle2;
    const songTitle3 = body.songTitle3;
    const categoryId = parseInt(body.categoryId, 10); // ID de la categoría

    try {
        // Conectar a la base de datos
        await mssql.connect(dbConfig);

        // Obtener el UserID del usuario
        const userResult = await new mssql.Request()
            .input('username', mssql.NVarChar, username)
            .query('SELECT UserID FROM Users WHERE Username = @username');
        
        if (userResult.recordset.length === 0) {
            return res.status(404).send('Usuario no encontrado.');
        }

        const userId = userResult.recordset[0].UserID;

        // Insertar la imagen en la tabla Images
        const imageRequest = new mssql.Request();
        imageRequest.input('userId', mssql.Int, userId);
        imageRequest.input('imageData', mssql.VarBinary, imageBuffer);
        imageRequest.input('description', mssql.NVarChar, description);
        imageRequest.input('song1', mssql.NVarChar, song1);
        imageRequest.input('song2', mssql.NVarChar, song2);
        imageRequest.input('song3', mssql.NVarChar, song3);
        imageRequest.input('song1Title', mssql.NVarChar, songTitle1);
        imageRequest.input('song2Title', mssql.NVarChar, songTitle2);
        imageRequest.input('song3Title', mssql.NVarChar, songTitle3);

        const imageResult = await imageRequest.query(`
            INSERT INTO Images (UserID, ImageData, Description, Song1, Song2, Song3, Song1Title, Song2Title, Song3Title)
            OUTPUT INSERTED.ImageID
            VALUES (@userId, @imageData, @description, @song1, @song2, @song3, @song1Title, @song2Title, @song3Title)
        `);

        const imageId = imageResult.recordset[0].ImageID;

        // Asociar la imagen con la categoría seleccionada en la tabla ImageCategory
        const categoryRequest = new mssql.Request();
        categoryRequest.input('imageId', mssql.Int, imageId);
        categoryRequest.input('categoryId', mssql.Int, categoryId);

        await categoryRequest.query(`
            INSERT INTO ImageCategory (ImageID, CategoryID)
            VALUES (@imageId, @categoryId)
        `);

        res.send('Imagen subida y asociada a la categoría correctamente.');
    } catch (err) {
        console.error('Error al subir la imagen:', err);
        res.status(500).send('Error interno.');
    } 
});

// Ruta para obtener imágenes por categoría
app.get('/images/:categoryId', async (req, res) => {
    const categoryId = parseInt(req.params.categoryId, 10);

    try {
        await mssql.connect(dbConfig);
        // Obtener imágenes de la categoría
        const result = await new mssql.Request()
            .input('categoryId', mssql.Int, categoryId)
            .query(`
                SELECT i.ImageID, i.Description, i.ImageData, 
                       i.Song1, i.Song2, i.Song3,
                       i.Song1Title, i.Song2Title, i.Song3Title
                FROM Images i
                JOIN ImageCategory ic ON i.ImageID = ic.ImageID
                WHERE ic.CategoryID = @categoryId
            `);
        if (result.recordset.length === 0) {
            return res.status(404).send('No se encontraron imágenes para esta categoría.');
        }
        
        const images = result.recordset.map(img => ({
            id: img.ImageID,
            description: img.Description,
            image: `data:image/jpeg;base64,${img.ImageData.toString('base64')}`,
            song1: { url: img.Song1, title: img.SongTitle1 },
            song2: { url: img.Song2, title: img.SongTitle2 },
            song3: { url: img.Song3, title: img.SongTitle3 }
        }));

        res.json(images);
    } catch (err) {
        console.error('Error al obtener las imágenes:', err);
        res.status(500).send('Error interno.');
    } 
});

// Rutas dinámicas para las categorías .html
app.get('/:category', (req, res) => {
    const category = req.params.category; // Extraer la categoría de la URL
    const filePath = path.join(__dirname, `./public/${category}.html`);
    // Verificar si el archivo existe antes de enviarlo
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Página no encontrada'); // Respuesta si el archivo no existe
    }
});

// Ruta para obtener detalles de una imagen
app.get('/image/:imageId', async (req, res) => {
  const imageId = parseInt(req.params.imageId, 10);

  try {
      await mssql.connect(dbConfig);

      const result = await new mssql.Request()
          .input('imageId', mssql.Int, imageId)
          .query(`
              SELECT 
                  i.ImageID, 
                  i.Description, 
                  i.ImageData, 
                  i.Song1, i.Song1Title,
                  i.Song2, i.Song2Title,
                  i.Song3, i.Song3Title,
                  i.Likes, 
                  u.Username, 
                  c.Name as CategoryName,
                  (SELECT COUNT(*) FROM SongVotes sv WHERE sv.ImageID = i.ImageID AND sv.SongOption = 1) AS Song1Votes,
                  (SELECT COUNT(*) FROM SongVotes sv WHERE sv.ImageID = i.ImageID AND sv.SongOption = 2) AS Song2Votes,
                  (SELECT COUNT(*) FROM SongVotes sv WHERE sv.ImageID = i.ImageID AND sv.SongOption = 3) AS Song3Votes
              FROM Images i
              JOIN Users u ON i.UserID = u.UserID
              JOIN ImageCategory ic ON ic.ImageID = i.ImageID
              JOIN Categories c ON ic.CategoryID = c.CategoryID
              WHERE i.ImageID = @imageId
          `);

      if (result.recordset.length === 0) {
          return res.status(404).send('Imagen no encontrada.');
      }

      const img = result.recordset[0];
      // Construir el objeto con el arreglo "songs" que incluya el id, título, url y votos.
      const image = {
          id: img.ImageID,
          description: img.Description,
          image: `data:image/jpeg;base64,${Buffer.from(img.ImageData).toString('base64')}`,
          songs: [
              { id: 1, url: img.Song1, title: img.Song1Title, votes: img.Song1Votes },
              { id: 2, url: img.Song2, title: img.Song2Title, votes: img.Song2Votes },
              { id: 3, url: img.Song3, title: img.Song3Title, votes: img.Song3Votes },
          ],
          likes: img.Likes,
          username: img.Username,
          category: img.CategoryName,
      };

      res.json(image);
  } catch (error) {
      console.error('Error al obtener la imagen:', error);
      res.status(500).send('Error interno');
  } 
});


//Ruta para manejar los likes

app.post('/like/:imageId', async (req, res) => {
    const imageId = parseInt(req.params.imageId, 10);
    const userId = req.session.userId; // Se obtiene desde la sesión
    console.log('userId en /like:', userId); // Verifica en la consola del servidor
    if (!imageId || !userId) {
      return res.status(400).json({ message: 'Faltan parámetros en la solicitud.' });

    }
  
    // Lógica para dar/quitar like...
    try {
      await mssql.connect(dbConfig);
  
      const existingLike = await new mssql.Request()
        .input('userId', mssql.Int, userId)
        .input('imageId', mssql.Int, imageId)
        .query("SELECT * FROM Likes WHERE UserID = @userId AND ImageID = @imageId");
  
      if (existingLike.recordset.length > 0) {
        // Quitar el like
        await new mssql.Request()
          .input('userId', mssql.Int, userId)
          .input('imageId', mssql.Int, imageId)
          .query("DELETE FROM Likes WHERE UserID = @userId AND ImageID = @imageId");
  
        await new mssql.Request()
          .input('imageId', mssql.Int, imageId)
          .query("UPDATE Images SET Likes = Likes - 1 WHERE ImageID = @imageId");
  
        const result = await new mssql.Request()
          .input('imageId', mssql.Int, imageId)
          .query("SELECT Likes FROM Images WHERE ImageID = @imageId");
  
        return res.json({ likes: result.recordset[0].Likes, userLiked: false });
      } else {
        // Dar like
        await new mssql.Request()
          .input('userId', mssql.Int, userId)
          .input('imageId', mssql.Int, imageId)
          .query("INSERT INTO Likes (UserID, ImageID) VALUES (@userId, @imageId)");
  
        await new mssql.Request()
          .input('imageId', mssql.Int, imageId)
          .query("UPDATE Images SET Likes = Likes + 1 WHERE ImageID = @imageId");
  
        const result = await new mssql.Request()
          .input('imageId', mssql.Int, imageId)
          .query("SELECT Likes FROM Images WHERE ImageID = @imageId");
  
        return res.json({ likes: result.recordset[0].Likes, userLiked: true });
      }
    } catch (error) {
      console.error('Error al hacer toggle de like:', error);
      res.status(500).json({ message: 'Error del servidor' });
    } 
  });
  
  
  app.get('/like-status/:imageId', async (req, res) => {
    const imageId = parseInt(req.params.imageId, 10);
    const userId = req.session.userId; // Se obtiene desde la sesión

    if (!imageId || !userId) {
        return res.status(400).json({ message: 'Faltan parámetros en la solicitud.' });
    }

    try {
        await mssql.connect(dbConfig);

        // Verificar si el usuario ha dado like a la imagen
        const existingLike = await new mssql.Request()
            .input('userId', mssql.Int, userId)
            .input('imageId', mssql.Int, imageId)
            .query("SELECT * FROM Likes WHERE UserID = @userId AND ImageID = @imageId");

        // Obtener el número total de likes en la imagen
        const likeCountResult = await new mssql.Request()
            .input('imageId', mssql.Int, imageId)
            .query("SELECT Likes FROM Images WHERE ImageID = @imageId");

        const totalLikes = likeCountResult.recordset.length > 0 ? likeCountResult.recordset[0].Likes : 0;
        const userLiked = existingLike.recordset.length > 0;

        res.json({ userLiked, likes: totalLikes });

    } catch (error) {
        console.error('Error al obtener el estado del like:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
});



//ruta para manejar los votos
app.post('/vote/:imageId/:songId', async (req, res) => {
    const imageId = parseInt(req.params.imageId, 10);
    const songId = parseInt(req.params.songId, 10);
    const userId = req.session.userId; // Se obtiene el userId de la sesión
  
    if (!imageId || !songId || !userId) {
      return res.status(400).json({ message: 'Faltan parámetros en la solicitud.' });
    }
  
    try {
      await mssql.connect(dbConfig);
  
      // Verificar si el usuario ya votó en esta imagen
      const existingVote = await new mssql.Request()
        .input('userId', mssql.Int, userId)
        .input('imageId', mssql.Int, imageId)
        .query("SELECT * FROM SongVotes WHERE UserID = @userId AND ImageID = @imageId");
  
      if (existingVote.recordset.length > 0) {
        // Si ya votó, se actualiza el voto para permitir el cambio de opción
        await new mssql.Request()
          .input('userId', mssql.Int, userId)
          .input('imageId', mssql.Int, imageId)
          .input('songId', mssql.Int, songId)
          .query("UPDATE SongVotes SET SongOption = @songId WHERE UserID = @userId AND ImageID = @imageId");
      } else {
        // Si no existe, se inserta el voto
        await new mssql.Request()
          .input('userId', mssql.Int, userId)
          .input('imageId', mssql.Int, imageId)
          .input('songId', mssql.Int, songId)
          .query("INSERT INTO SongVotes (UserID, ImageID, SongOption) VALUES (@userId, @imageId, @songId)");
      }
  
      // Contar cuántos votos tiene la opción elegida
      const votesResult = await new mssql.Request()
        .input('imageId', mssql.Int, imageId)
        .input('songId', mssql.Int, songId)
        .query("SELECT COUNT(*) AS Votes FROM SongVotes WHERE ImageID = @imageId AND SongOption = @songId");
  
      res.json({ votes: votesResult.recordset[0].Votes });
    } catch (error) {
      console.error('Error al votar por la canción:', error);
      res.status(500).json({ message: 'Error del servidor' });
    } 
  });


// Ruta para obtener la información del perfil del usuario
// Ruta para obtener la información del perfil del usuario
app.get('/api/profile', async (req, res) => {
  // Suponemos que el usuario se autentica y su ID se guarda en la sesión
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    await mssql.connect(dbConfig);

    // Obtener datos del usuario
    const userResult = await new mssql.Request()
      .input('userId', mssql.Int, userId)
      .query('SELECT Username, Email FROM Users WHERE UserID = @userId');
    const user = userResult.recordset[0];
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Obtener imágenes subidas por el usuario
    const imagesResult = await new mssql.Request()
      .input('userId', mssql.Int, userId)
      .query(`
        SELECT ImageID, Description, ImageData, 
               Song1, Song2, Song3,
               Song1Title, Song2Title, Song3Title
        FROM Images
        WHERE UserID = @userId
      `);

    // Convertir la imagen (buffer) a base64 para enviarla al cliente
    const images = imagesResult.recordset.map(image => ({
      ...image,
      ImageData: image.ImageData ? image.ImageData.toString('base64') : null
    }));

    res.json({ user, images });
  } catch (err) {
    console.error('Error al obtener datos del perfil:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Servir recursos estáticos como CSS o imágenes
app.use(express.static(path.join(__dirname, 'public')));
// Puerto del servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

