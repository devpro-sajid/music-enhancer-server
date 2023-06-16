const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
// const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z2zpf1s.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10
    }
});


async function run() {
    try {

        const usersCollection = client.db("musicenDb").collection("users");
        const classesCollection = client.db("musicenDb").collection("classes");
        const selectedCollection = client.db("musicenDb").collection("selectedClasses");


        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7d' })

            res.send({ token })
        })
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }
        // general api
        app.get("/popularClasses/", async (req, res) => {
            const result = await classesCollection.find({ status: 'approved' }).sort({ availableSeats: -1 }).limit(6).toArray();
            res.send(result);
        });
        app.get("/allClasses/", async (req, res) => {
            const result = await classesCollection.find({ status: 'approved' }).toArray();
            res.send(result);
        });
        app.get("/allInstructors/", async (req, res) => {
            const result = await usersCollection.find({ role: 'instructor' }).toArray();
            res.send(result);
        });


        //   user api
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })
        app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = 'student';
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user Already Exist' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })

        // admin task
        app.get('/allclasses', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        })
        app.patch('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.patch('/users/instructor/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.patch('/users/student/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'student'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })
        // class status update by admin
        app.patch('/classes/approve/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'approved'
                }
            }
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        })
        app.patch('/classes/deny/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'denied'
                }
            }
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        })
        app.patch('/classes/feedback/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const feedbackData = req.body;
            const { feedbackText } = feedbackData;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    feedback: feedbackText
                }
            }
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        })
        //   instructor verify and tasks
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        })
        app.get('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const query = { instructorEmail: email };
            const result = await classesCollection.find(query).toArray();
            res.send(result);
        })
        app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const item = req.body;
            const result = await classesCollection.insertOne(item);
            res.send(result);
        })
        app.patch('/classes/:id', verifyJWT, verifyInstructor, async (req, res) => {
            const id = req.params.id;
            const updatedClass = req.body;
            const {className,image,availableSeats,price,status}=updatedClass;
            if(status==='approved'){
                return;
            }
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    className:className,
                    image:image,
                    availableSeats:availableSeats,
                    price:price

                }
            }
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        //   verify student and tasks
        app.get('/selectedClasses', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
              res.send([]);
            }
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
              return res.status(403).send({ error: true, message: 'forbidden Access' })
            }
            const query = { email: email };
            const result = await selectedCollection.find(query).toArray();
            res.send(result);
          })
        app.get('/users/student/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { student: user?.role === 'student' }
            res.send(result);
        })
        app.post('/selectedClasses', async (req, res) => {
            const item = req.body;
            console.log(item);
            const query = {
                email: item.email,
                selectedId: item.selectedId
            }
            const existAlready = await selectedCollection.find(query).toArray();
            console.log(existAlready)
            if (existAlready.length !== 0) {
                return res.status(403).send({ error: true, message: 'Already added by you' });
            }
            const result = await selectedCollection.insertOne(item);
            res.send(result);
        })
        app.delete('/selectedClasses/:id',verifyJWT, async (req, res) => {
            const selectedForDelete = { _id: new ObjectId(req.params.id) };
            const result = await selectedCollection.deleteOne(selectedForDelete);
            res.send(result)
          })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Music is running')
})

app.listen(port, () => {
    console.log(`Music is running on port ${port}`);
})